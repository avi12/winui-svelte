import type { ShellBackend, ShortcutProperties } from "./backend.ts";
import { failure, ShellFailure, SUCCESS } from "./kinds.ts";
import { DynWinRtValue, WinGuid } from "@microsoft/dynwinrt";
import { initializeCom } from "@microsoft/dynwinrt/com/unsafe";
import { DynCom, DynComMethodSig, DynComUnsafe } from "@microsoft/dynwinrt/com/unsafe";
import { DynComRawMemory, DynComRawOwnedComPointer } from "@microsoft/dynwinrt/com/unsafe/raw";
import {
  bind,
  numberOf,
  POINTER_BYTES,
  pointerOf,
  WIDE_CHAR_BYTES,
  wideMemory,
  withMemory
} from "#src/win32-calls.js";

// SHFileOperationW for the Recycle Bin, and IShellLink with IPersistFile for
// shortcuts. Neither interface has a WinRT form, so their methods are declared
// here by hand at their vtable slots, as the taskbar's are. COM is already
// initialised on the thread that calls: the UI thread by WinUI.

const CLSID_SHELL_LINK = "00021401-0000-0000-C000-000000000046";
const IID_SHELL_LINK = WinGuid.parse("000214f9-0000-0000-c000-000000000046");
const IID_PERSIST_FILE = WinGuid.parse("0000010b-0000-0000-c000-000000000046");

const GET_PATH_SLOT = 3;
const GET_DESCRIPTION_SLOT = 6;
const SET_DESCRIPTION_SLOT = 7;
const GET_WORKING_DIRECTORY_SLOT = 8;
const SET_WORKING_DIRECTORY_SLOT = 9;
const GET_ARGUMENTS_SLOT = 10;
const SET_ARGUMENTS_SLOT = 11;
const GET_ICON_LOCATION_SLOT = 16;
const SET_ICON_LOCATION_SLOT = 17;
const SET_PATH_SLOT = 20;
const LOAD_SLOT = 5;
const SAVE_SLOT = 6;

const MAX_PATH_CHARS = 32_768;
const INFO_TIP_CHARS = 1024;
const SLGP_RAWPATH = 4;
const STGM_READ = 0;
const STGM_SHARE_DENY_WRITE = 0x20;
const REMEMBER = 1;

// SHFILEOPSTRUCTW (shellapi.h, 64-bit layout).
const FO_DELETE = 3;
const FOF_SILENT = 0x4;
const FOF_NOCONFIRMATION = 0x10;
const FOF_ALLOWUNDO = 0x40;
const FOF_NOERRORUI = 0x400;
const FOF_WANTNUKEWARNING = 0x4000;
// ALLOWUNDO is what sends to the bin; WANTNUKEWARNING makes Windows ask
// before deleting for good (a file too big for the bin) even with the other
// prompts off.
const HEX_RADIX = 16;
const RECYCLE_FLAGS = FOF_ALLOWUNDO | FOF_NOCONFIRMATION | FOF_WANTNUKEWARNING | FOF_SILENT | FOF_NOERRORUI;
const FILE_OPERATION_SIZE = 56;
const OFFSET_FUNCTION = 8;
const OFFSET_FROM = 16;
const OFFSET_FLAGS = 32;
const OFFSET_ABORTED = 36;

type LinkMethods = ReturnType<typeof linkMethods>;

function pointer() {
  return DynComUnsafe.unclassifiedPointerType();
}

function setterSig() {
  return new DynComMethodSig().addIn(pointer());
}

function getterSig() {
  return new DynComMethodSig().addIn(pointer()).addIn(DynCom.i32Type());
}

function linkMethods() {
  return DynComUnsafe.registerIUnknownInterface("IShellLinkW", IID_SHELL_LINK)
    .addMethodAt(
      GET_PATH_SLOT,
      "GetPath",
      new DynComMethodSig().addIn(pointer()).addIn(DynCom.i32Type()).addNullableIn(pointer()).addIn(DynCom.u32Type())
    )
    .addMethodAt(GET_DESCRIPTION_SLOT, "GetDescription", getterSig())
    .addMethodAt(SET_DESCRIPTION_SLOT, "SetDescription", setterSig())
    .addMethodAt(GET_WORKING_DIRECTORY_SLOT, "GetWorkingDirectory", getterSig())
    .addMethodAt(SET_WORKING_DIRECTORY_SLOT, "SetWorkingDirectory", setterSig())
    .addMethodAt(GET_ARGUMENTS_SLOT, "GetArguments", getterSig())
    .addMethodAt(SET_ARGUMENTS_SLOT, "SetArguments", setterSig())
    .addMethodAt(
      GET_ICON_LOCATION_SLOT,
      "GetIconLocation",
      new DynComMethodSig().addIn(pointer()).addIn(DynCom.i32Type()).addIn(pointer())
    )
    .addMethodAt(SET_ICON_LOCATION_SLOT, "SetIconLocation", new DynComMethodSig().addIn(pointer()).addIn(DynCom.i32Type()))
    .addMethodAt(SET_PATH_SLOT, "SetPath", setterSig());
}

function persistMethods() {
  return DynComUnsafe.registerIUnknownInterface("IPersistFile", IID_PERSIST_FILE)
    .addMethodAt(LOAD_SLOT, "Load", new DynComMethodSig().addIn(pointer()).addIn(DynCom.u32Type()))
    .addMethodAt(SAVE_SLOT, "Save", new DynComMethodSig().addIn(pointer()).addIn(DynCom.i32Type()));
}

function textOf({ memory, offset = 0, chars }: {
  memory: DynComRawMemory;
  offset?: number;
  chars: number;
}) {
  return memory.readBytes(offset, chars * WIDE_CHAR_BYTES).toString("utf16le").split("\0", 1)[0] ?? "";
}

function readText({ instance, methods, slot, chars }: {
  instance: DynWinRtValue;
  methods: LinkMethods;
  slot: number;
  chars: number;
}) {
  return withMemory({
    size: chars * WIDE_CHAR_BYTES,
    alignment: WIDE_CHAR_BYTES,
    use(buffer) {
      methods.method(slot).invoke(instance, [
        DynComUnsafe.pointer(buffer.pointer().address),
        DynWinRtValue.i32(chars)
      ]);
      return textOf({
        memory: buffer,
        chars
      });
    }
  });
}

// A WinUI thread is in an apartment already, and asking for another kind fails;
// a plain Node thread has none, and CoCreateInstance needs one.
function ensureApartment() {
  try {
    initializeCom();
  } catch {
    return;
  }
}

function withLink<T>(use: (options: {
  instance: DynWinRtValue;
  file: DynWinRtValue;
}) => T) {
  ensureApartment();
  const instance = DynComUnsafe.coCreateInstance(CLSID_SHELL_LINK, IID_SHELL_LINK);
  const file = DynComRawOwnedComPointer.queryInterface(instance, IID_PERSIST_FILE).intoManaged(IID_PERSIST_FILE);
  try {
    return use({
      instance,
      file
    });
  } finally {
    file.release();
    instance.release();
  }
}

function withText<T>({ text, use }: {
  text: string;
  use: (value: DynWinRtValue) => T;
}) {
  const memory = wideMemory(text);
  try {
    return use(DynComUnsafe.pointer(memory.pointer().address));
  } finally {
    memory.release();
  }
}

function recycleResult({ status, isAborted }: {
  status: number;
  isAborted: boolean;
}) {
  if (isAborted) {
    return failure({
      reason: ShellFailure.ABORTED,
      message: "the operation was cancelled"
    });
  }

  return status === 0 ? SUCCESS : failure({
    reason: ShellFailure.FAILED,
    message: `SHFileOperationW failed with code 0x${status.toString(HEX_RADIX)}`
  });
}

/**
 * The real calls: `SHFileOperationW` and `IShellLink`. Nothing is bound until
 * this is called.
 *
 * @returns A backend for the shell verbs.
 */
export function createShellNative() {
  const fileOperation = bind({
    dll: "shell32.dll",
    entryPoint: "SHFileOperationW",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const link = linkMethods();
  const persist = persistMethods();

  const backend: ShellBackend = {
    recycle(paths) {
      // pFrom is a list of paths, each ended by a null, and the list by a second null.
      const list = Buffer.from(`${paths.join("\0")}\0\0`, "utf16le");
      const names = DynComRawMemory.allocate(list.length, WIDE_CHAR_BYTES);
      const operation = DynComRawMemory.allocate(FILE_OPERATION_SIZE, POINTER_BYTES);
      try {
        names.writeBytes(0, list);
        operation.writeU32(OFFSET_FUNCTION, FO_DELETE);
        operation.writeU64(OFFSET_FROM, names.pointer().address);
        operation.writeU16(OFFSET_FLAGS, RECYCLE_FLAGS);
        const status = numberOf(fileOperation.invoke([pointerOf(operation)]).returnValue);
        return recycleResult({
          status,
          isAborted: operation.readU32(OFFSET_ABORTED) !== 0
        });
      } finally {
        operation.release();
        names.release();
      }
    },
    writeShortcut(properties) {
      withLink(({ instance, file }) => {
        const setters = [
          [SET_PATH_SLOT, properties.target],
          [SET_ARGUMENTS_SLOT, properties.arguments],
          [SET_WORKING_DIRECTORY_SLOT, properties.workingDirectory],
          [SET_DESCRIPTION_SLOT, properties.description]
        ] as const;
        for (const [slot, text] of setters) {
          withText({
            text,
            use: value => link.method(slot).invoke(instance, [value])
          });
        }

        const hasIcon = properties.iconPath.length > 0;
        if (hasIcon) {
          withText({
            text: properties.iconPath,
            use: value => link.method(SET_ICON_LOCATION_SLOT).invoke(instance, [
              value,
              DynWinRtValue.i32(properties.iconIndex)
            ])
          });
        }

        withText({
          text: properties.path,
          use: value => persist.method(SAVE_SLOT).invoke(file, [value, DynWinRtValue.i32(REMEMBER)])
        });
      });
    },
    readShortcut(path) {
      return withLink(({ instance, file }) => {
        withText({
          text: path,
          use: value => persist.method(LOAD_SLOT).invoke(file, [
            value,
            DynWinRtValue.u32(STGM_READ | STGM_SHARE_DENY_WRITE)
          ])
        });
        const indexOffset = MAX_PATH_CHARS * WIDE_CHAR_BYTES;
        const { target, iconPath, iconIndex } = withMemory({
          size: 2 * indexOffset + POINTER_BYTES,
          alignment: POINTER_BYTES,
          use(buffer) {
            link.method(GET_PATH_SLOT).invoke(instance, [
              DynComUnsafe.pointer(buffer.pointer().address),
              DynWinRtValue.i32(MAX_PATH_CHARS),
              DynComUnsafe.pointer(null),
              DynWinRtValue.u32(SLGP_RAWPATH)
            ]);
            const iconOffset = indexOffset;
            const numberOffset = 2 * indexOffset;
            link.method(GET_ICON_LOCATION_SLOT).invoke(instance, [
              DynComUnsafe.pointer(buffer.pointer(iconOffset).address),
              DynWinRtValue.i32(MAX_PATH_CHARS),
              DynComUnsafe.pointer(buffer.pointer(numberOffset).address)
            ]);
            return {
              target: textOf({
                memory: buffer,
                chars: MAX_PATH_CHARS
              }),
              iconPath: textOf({
                memory: buffer,
                offset: iconOffset,
                chars: MAX_PATH_CHARS
              }),
              iconIndex: buffer.readI32(numberOffset)
            };
          }
        });
        function textAt({ slot, chars }: {
          slot: number;
          chars: number;
        }) {
          return readText({
            instance,
            methods: link,
            slot,
            chars
          });
        }

        return {
          target,
          arguments: textAt({
            slot: GET_ARGUMENTS_SLOT,
            chars: MAX_PATH_CHARS
          }),
          workingDirectory: textAt({
            slot: GET_WORKING_DIRECTORY_SLOT,
            chars: MAX_PATH_CHARS
          }),
          iconPath,
          iconIndex,
          description: textAt({
            slot: GET_DESCRIPTION_SLOT,
            chars: INFO_TIP_CHARS
          })
        } satisfies ShortcutProperties;
      });
    }
  };
  return backend;
}
