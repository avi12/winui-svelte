import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bindDll, DWORD_BYTES, NO_ADDRESS } from "#src/win32-calls.js";

// The shell hands the tray icon's keyboard and touch activation to the owner window as sent messages, which
// only a window procedure sees. The package has no native callback, so the procedure is a few bytes of
// machine code: it writes the wParam and lParam of the callback message into a ring and returns, and any
// other message goes to DefWindowProcW. The ring is read from JavaScript.

/** The window message the shell sends for the icon's mouse, keyboard and touch events. */
export const CALLBACK_MESSAGE = 0x8001;
const SLOT_COUNT = 256;
const SLOT_BYTES = 16;
const HEADER_BYTES = 8;
const ALIGNMENT = 8;
const PAGE_BYTES = 4096n;
const COMMIT_AND_RESERVE = 0x3000;
const EXECUTE_READ_WRITE = 0x40;
const RELEASE = 0x8000;
const WINDOW_PROCEDURE_INDEX = -4;
const WORD_MASK = 0xFFFFn;
const SLOT_MASK = BigInt(SLOT_COUNT - 1);
const SLOT_COUNT_BIG = BigInt(SLOT_COUNT);
const IMMEDIATE_BYTES = 8;
const NOTHING_SEEN = 0n;
const X64_ARCHITECTURE = "x64";

const kernel32 = bindDll({
  dll: "kernel32.dll",
  functions: {
    allocate: ["VirtualAlloc", ["pointer", "i64", "u32", "u32"], "pointer"],
    release: ["VirtualFree", ["pointer", "i64", "u32"], "i32"],
    moduleHandle: ["GetModuleHandleW", ["pointer"], "pointer"],
    procedureAddress: ["GetProcAddress", ["pointer", "pointer"], "pointer"]
  }
});

const user32 = bindDll({
  dll: "user32.dll",
  functions: {
    setProcedure: ["SetWindowLongPtrW", ["pointer", "i32", "i64"], "pointer"]
  }
});

function immediate32(value: number) {
  const bytes = Buffer.alloc(DWORD_BYTES);
  bytes.writeUInt32LE(value);
  return bytes;
}

function immediate(value: bigint) {
  const bytes = Buffer.alloc(IMMEDIATE_BYTES);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

const COMPARE_MESSAGE = "81fa";
const BRANCH_TO_DEFAULT = "7530";
const LOAD_IMMEDIATE = "48b8";
const STORE_PARAMETERS =
  "4c8b10" + "4d89d3" + "4981e3ff000000" + "49c1e304" + "4e8d5c1808" + "4d8903" + "4d894b08" + "49ffc2" + "4c8910" + "31c0c3";
const JUMP_TO_REGISTER = "ffe0";

function hex(text: string) {
  return Buffer.from(text, "hex");
}

// x64: `if (message != CALLBACK_MESSAGE) goto default; ring[index++ & 255] = {wParam, lParam}; return 0`, and
// `default: jmp DefWindowProcW`. Arguments arrive in rcx (window), edx (message), r8 (wParam), r9 (lParam).
function machineCode({ ring, defaultProcedure }: {
  readonly ring: bigint;
  readonly defaultProcedure: bigint;
}) {
  return Buffer.concat([
    hex(COMPARE_MESSAGE),
    immediate32(CALLBACK_MESSAGE),
    hex(BRANCH_TO_DEFAULT),
    hex(LOAD_IMMEDIATE),
    immediate(ring),
    hex(STORE_PARAMETERS),
    hex(LOAD_IMMEDIATE),
    immediate(defaultProcedure),
    hex(JUMP_TO_REGISTER)
  ]);
}

function defaultProcedureAddress() {
  const name = DynComRawMemory.allocate(IMMEDIATE_BYTES * 2, 1);
  try {
    name.writeBytes(0, Buffer.from("DefWindowProcW\0", "ascii"));
    return kernel32.procedureAddress(kernel32.moduleHandle("user32.dll"), name);
  } finally {
    name.release();
  }
}

/** Whether this process can run the window procedure's machine code (x64 only). */
export function canReceiveSentMessages() {
  return process.arch === X64_ARCHITECTURE;
}

/** One callback message the shell sent: its parameters, as the window procedure saw them. */
export interface MailboxMessage {
  readonly wparam: bigint;
  readonly code: number;
}

/**
 * Makes `hwnd` answer the tray callback message from a window procedure of its own, so that the messages the
 * shell sends (keyboard, touch and pen activation) are kept instead of lost.
 *
 * @param hwnd - The tray's owner window, created by this thread.
 * @returns `read` drains what arrived since the last call, oldest first; `release` frees the procedure
 *     after the window is destroyed.
 */
export function createMessageMailbox(hwnd: bigint) {
  const ring = DynComRawMemory.allocate(HEADER_BYTES + SLOT_COUNT * SLOT_BYTES, ALIGNMENT);
  ring.writeBytes(0, Buffer.alloc(HEADER_BYTES + SLOT_COUNT * SLOT_BYTES));
  const code = machineCode({
    ring: ring.pointer().address,
    defaultProcedure: defaultProcedureAddress()
  });
  const page = kernel32.allocate(null, PAGE_BYTES, COMMIT_AND_RESERVE, EXECUTE_READ_WRITE);
  DynComRawMemory.fromUnsafeAddress(page, PAGE_BYTES, ALIGNMENT * 2).writeBytes(0, code);
  user32.setProcedure(hwnd, WINDOW_PROCEDURE_INDEX, page);
  let seen = NOTHING_SEEN;

  return {
    read() {
      const written = ring.readU64(0);
      seen = written - seen > SLOT_COUNT_BIG ? written - SLOT_COUNT_BIG : seen;
      const messages: MailboxMessage[] = [];
      while (seen < written) {
        const slot = HEADER_BYTES + Number(seen & SLOT_MASK) * SLOT_BYTES;
        messages.push({
          wparam: ring.readU64(slot),
          code: Number(ring.readU64(slot + IMMEDIATE_BYTES) & WORD_MASK)
        });
        seen++;
      }

      return messages;
    },
    release() {
      kernel32.release(page, NO_ADDRESS, RELEASE);
      ring.release();
    }
  };
}
