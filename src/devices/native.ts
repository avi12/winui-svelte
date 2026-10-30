import type { PrinterRecord, PrinterSource } from "./printer-source.ts";
import type { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import {
  addressOf,
  bind,
  numberOf,
  pointerOf,
  WIDE_CHAR_BYTES,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";

// Every Win32 call the devices modules make, behind the interfaces the rest of
// them use, so the rest is pure logic a test drives with a fake. The functions
// are bound when a source is made, never when the module loads.

const NULL_ADDRESS = 0n;
const ENUM_LOCAL = 0x2;
const ENUM_CONNECTIONS = 0x4;
const INFO_LEVEL = 2;
const INFO_SIZE = 136;
const DWORD_BYTES = 4;
const POINTER_BYTES = 8;
const NAME_CHARS = 260;
const OFFSET_SERVER = 0;
const OFFSET_NAME = 8;
const OFFSET_SHARE = 16;
const OFFSET_PORT = 24;
const OFFSET_DRIVER = 32;
const OFFSET_COMMENT = 40;
const OFFSET_LOCATION = 48;
const OFFSET_ATTRIBUTES = 104;
const OFFSET_STATUS = 124;
const OFFSET_JOBS = 128;

// A string the call left in its buffer, pointed to by a field: the pointer is an address inside the buffer.
function stringAt({ bytes, base, field }: {
  bytes: Buffer;
  base: bigint;
  field: bigint;
}) {
  const isNull = field === NULL_ADDRESS;
  if (isNull) {
    return null;
  }

  const start = Number(field - base);
  let end = start;
  while (end + 1 < bytes.length && (bytes[end] !== 0 || bytes[end + 1] !== 0)) {
    end += WIDE_CHAR_BYTES;
  }

  return bytes.subarray(start, end).toString("utf16le");
}

/**
 * The printer source over `EnumPrintersW` and `GetDefaultPrinterW`. Reads
 * only; the functions are bound when this is called.
 *
 * @returns Reads of the installed printers.
 */
export function windowsPrinterSource() {
  const enumPrinters = bind({
    dll: "winspool.drv",
    entryPoint: "EnumPrintersW",
    parameters: ["u32", "pointer", "u32", "pointer", "u32", "pointer", "pointer"],
    returnType: "i32"
  });
  const getDefault = bind({
    dll: "winspool.drv",
    entryPoint: "GetDefaultPrinterW",
    parameters: ["pointer", "pointer"],
    returnType: "i32"
  });
  function enumerate({ buffer, counts, size }: {
    buffer: DynComRawMemory | null;
    counts: DynComRawMemory;
    size: number;
  }) {
    enumPrinters.invoke([
      DynWin32.u32(ENUM_LOCAL | ENUM_CONNECTIONS), pointerOf(null), DynWin32.u32(INFO_LEVEL),
      pointerOf(buffer), DynWin32.u32(size),
      DynWin32Unsafe.pointer(counts.pointer(0).address), DynWin32Unsafe.pointer(counts.pointer(DWORD_BYTES).address)
    ]);
  }
  return {
    list() {
      return withMemory({
        size: 2 * DWORD_BYTES,
        alignment: DWORD_BYTES,
        use(counts) {
          enumerate({
            buffer: null,
            counts,
            size: 0
          });
          const needed = counts.readU32(0);
          const isEmpty = needed === 0;
          if (isEmpty) {
            return [];
          }

          return withMemory({
            size: needed,
            alignment: POINTER_BYTES,
            use(buffer) {
              enumerate({
                buffer,
                counts,
                size: needed
              });
              const bytes = buffer.readBytes(0, needed);
              const base = buffer.pointer().address;
              function text(offset: number) {
                return stringAt({
                  bytes,
                  base,
                  field: buffer.readU64(offset)
                });
              }
              const records: PrinterRecord[] = [];
              const count = counts.readU32(DWORD_BYTES);
              for (let iPrinter = 0; iPrinter < count; iPrinter++) {
                const start = iPrinter * INFO_SIZE;
                records.push({
                  name: text(start + OFFSET_NAME) ?? "",
                  serverName: text(start + OFFSET_SERVER),
                  shareName: text(start + OFFSET_SHARE),
                  portName: text(start + OFFSET_PORT),
                  driverName: text(start + OFFSET_DRIVER),
                  location: text(start + OFFSET_LOCATION),
                  comment: text(start + OFFSET_COMMENT),
                  attributes: buffer.readU32(start + OFFSET_ATTRIBUTES),
                  status: buffer.readU32(start + OFFSET_STATUS),
                  jobCount: buffer.readU32(start + OFFSET_JOBS)
                });
              }

              return records;
            }
          });
        }
      });
    },
    defaultName() {
      return withMemory({
        size: NAME_CHARS * WIDE_CHAR_BYTES + DWORD_BYTES,
        alignment: DWORD_BYTES,
        use(buffer) {
          const countOffset = NAME_CHARS * WIDE_CHAR_BYTES;
          buffer.writeU32(countOffset, NAME_CHARS);
          const count = DynWin32Unsafe.pointer(buffer.pointer(countOffset).address);
          const result = getDefault.invoke([pointerOf(buffer), count]);
          const isFound = numberOf(result.returnValue) !== 0;
          if (!isFound) {
            return null;
          }

          return buffer.readBytes(0, countOffset).toString("utf16le").split("\0")[0] ?? null;
        }
      });
    }
  } satisfies PrinterSource;
}

const SHOW_HIDDEN = 0;
const NO_WINDOW = 0n;

/**
 * Asks the shell to print a file (`ShellExecuteW`, the `print` verb, or
 * `printto` when a printer is named).
 *
 * @param options - The file, the printer name (the default printer when omitted) and the owner window handle.
 * @returns The value `ShellExecuteW` returned: above 32 it worked, otherwise an error code.
 */
export function shellPrint({ path, printerName, window = NO_WINDOW }: {
  path: string;
  printerName?: string;
  window?: bigint;
}) {
  const shellExecute = bind({
    dll: "shell32.dll",
    entryPoint: "ShellExecuteW",
    parameters: ["pointer", "pointer", "pointer", "pointer", "pointer", "i32"],
    returnType: "pointer"
  });
  const hasPrinter = printerName !== undefined;
  const verb = wideMemory(hasPrinter ? "printto" : "print");
  const file = wideMemory(path);
  const printer = hasPrinter ? wideMemory(`"${printerName}"`) : null;
  try {
    const result = shellExecute.invoke([
      DynWin32Unsafe.pointer(window),
      pointerOf(verb),
      pointerOf(file),
      pointerOf(printer),
      pointerOf(null),
      DynWin32.i32(SHOW_HIDDEN)
    ]);
    return addressOf(result.returnValue);
  } finally {
    verb.release();
    file.release();
    printer?.release();
  }
}
