import type { DynWinRTValue } from "@microsoft/dynwinrt/com/unsafe";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import {
  bind,
  bindDll,
  DWORD_BYTES,
  NO_ADDRESS,
  POINTER_BYTES,
  withMemory
} from "#src/win32-calls.js";

// The flat Win32 calls of a drag from another app: OLE's registration of a
// window as a drop target, the clipboard format ids and the cursor's place in
// the window.

/** The interface id of `IDataObject`, what a drag carries. */
export const DATA_OBJECT_IID = "0000010e-0000-0000-c000-000000000046";
const POINT_BYTES = 8;
const HRESULT_FAILED = -1;
const GUID_BYTES = 16;
const GUID_DATA1_END = 4;
const GUID_DATA2_END = 6;
const GUID_DATA3_END = 8;
const IN_PROCESS_SERVER = 1;

// A GUID's first three fields are little-endian in memory, the rest are bytes.
function guidBytesOf(guid: string) {
  const bytes = Buffer.from(guid.replaceAll("-", ""), "hex");
  bytes.subarray(0, GUID_DATA1_END).reverse();
  bytes.subarray(GUID_DATA1_END, GUID_DATA2_END).reverse();
  bytes.subarray(GUID_DATA2_END, GUID_DATA3_END).reverse();
  return bytes;
}

function makeCalls() {
  return {
    ...bindDll({
      dll: "ole32.dll",
      functions: {
        createInstance: ["CoCreateInstance", ["pointer", "pointer", "u32", "pointer", "pointer"], "i32"],
        oleInitialize: ["OleInitialize", ["pointer"], "i32"],
        revokeDragDrop: ["RevokeDragDrop", ["pointer"], "i32"]
      }
    }),
    ...bindDll({
      dll: "user32.dll",
      functions: {
        findChildWindow: ["FindWindowExW", ["pointer", "pointer", "pointer", "pointer"], "pointer"],
        registerFormat: ["RegisterClipboardFormatW", ["pointer"], "u32"],
        screenToClient: ["ScreenToClient", ["pointer", "pointer"], "i32"]
      }
    }),
    registerDragDrop: bind({
      dll: "ole32.dll",
      entryPoint: "RegisterDragDrop",
      parameters: ["pointer", "pointer"],
      returnType: "i32"
    })
  };
}

let cachedCalls: ReturnType<typeof makeCalls> | undefined;

function callsOf() {
  cachedCalls ??= makeCalls();
  return cachedCalls;
}

/** Enters OLE on this thread (the apartment WinUI runs in), which a drop target needs; harmless when already in. */
export function enterOle() {
  callsOf().oleInitialize(null);
}

/**
 * Registers an object as the window's OLE drop target (`RegisterDragDrop`).
 *
 * @param options - The window, the `IDropTarget` object and its interface id.
 * @returns The HRESULT; 0 when registered.
 */
export function registerDropTarget({ hwnd, target, iid }: {
  hwnd: bigint;
  target: DynWinRTValue;
  iid: string;
}) {
  const { returnValue } = callsOf().registerDragDrop.invoke([
    DynWin32Unsafe.pointer(hwnd),
    DynWin32.comObject(target, iid)
  ]);
  return returnValue === null ? HRESULT_FAILED : DynWin32.toNumber(returnValue);
}

/**
 * Removes the window's OLE drop target (`RevokeDragDrop`).
 *
 * @param hwnd - The window.
 */
export function revokeDropTarget(hwnd: bigint) {
  callsOf().revokeDragDrop(hwnd);
}

/**
 * Makes an in-process COM object (`CoCreateInstance`).
 *
 * @param options - The class id and the interface id wanted, as GUID strings.
 * @returns The interface pointer's address, owned by the caller; 0 when the object could not be made.
 */
export function createInstanceOf({ classId, interfaceId }: {
  classId: string;
  interfaceId: string;
}) {
  return withMemory({
    size: GUID_BYTES,
    alignment: DWORD_BYTES,
    use: clsid => withMemory({
      size: GUID_BYTES,
      alignment: DWORD_BYTES,
      use: iid => withMemory({
        size: POINTER_BYTES,
        alignment: POINTER_BYTES,
        use(out) {
          clsid.writeBytes(0, guidBytesOf(classId));
          iid.writeBytes(0, guidBytesOf(interfaceId));
          const hresult = callsOf().createInstance(clsid, null, IN_PROCESS_SERVER, iid, out);
          const isCreated = hresult === 0;
          return isCreated ? out.readBytes(0, POINTER_BYTES).readBigUInt64LE(0) : NO_ADDRESS;
        }
      })
    })
  });
}

/**
 * The first child window of a class (`FindWindowEx`).
 *
 * @param options - The parent window and the window class name.
 * @returns The child's handle; 0 when there is none.
 */
export function findChildWindow({ hwnd, className }: {
  hwnd: bigint;
  className: string;
}) {
  return callsOf().findChildWindow(hwnd, null, className, null);
}

/**
 * The id of a clipboard format by name (`RegisterClipboardFormat`).
 *
 * @param name - The format's name, such as "HTML Format".
 * @returns The id.
 */
export function formatIdOf(name: string) {
  return callsOf().registerFormat(name);
}

/**
 * A screen point in a window's client area (`ScreenToClient`).
 *
 * @param options - The window and the point in screen pixels.
 * @returns The point in the window's client pixels.
 */
export function clientPointOf({ hwnd, point }: {
  hwnd: bigint;
  point: {
    readonly x: number;
    readonly y: number;
  };
}) {
  return withMemory({
    size: POINT_BYTES,
    alignment: DWORD_BYTES,
    use(memory) {
      const bytes = Buffer.alloc(POINT_BYTES);
      bytes.writeInt32LE(point.x, 0);
      bytes.writeInt32LE(point.y, DWORD_BYTES);
      memory.writeBytes(0, bytes);
      callsOf().screenToClient(hwnd, memory);
      const client = memory.readBytes(0, POINT_BYTES);
      return {
        x: client.readInt32LE(0),
        y: client.readInt32LE(DWORD_BYTES)
      };
    }
  });
}
