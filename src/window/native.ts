import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";

// The window's only flat Win32 calls: the rest is WinUI's own API.

const BASE_DPI = 96;
const OWNER_INDEX = -8;

const getDpiForWindow = DynWin32Unsafe.bind({
  dll: "user32.dll",
  entryPoint: "GetDpiForWindow",
  parameters: [
    {
      type: "handle",
      direction: "in"
    }
  ],
  returnType: "u32"
});

const setAppUserModelId = DynWin32Unsafe.bind({
  dll: "shell32.dll",
  entryPoint: "SetCurrentProcessExplicitAppUserModelID",
  parameters: [
    {
      type: "pointer",
      direction: "in"
    }
  ],
  returnType: "i32"
});

const setWindowLongPointer = DynWin32Unsafe.bind({
  dll: "user32.dll",
  entryPoint: "SetWindowLongPtrW",
  parameters: [
    {
      type: "handle",
      direction: "in"
    },
    {
      type: "i32",
      direction: "in"
    },
    {
      type: "i64",
      direction: "in"
    }
  ],
  returnType: "i64"
});

/**
 * Names the process for the taskbar and notifications: its windows then group
 * under that id (with the name and icon the app registered for it) rather than
 * under the host program (Node.js). Call it before the first window.
 */
export function joinAppUserModel(appId: string) {
  setAppUserModelId.invoke([DynWin32.wideString(appId)]);
}

/**
 * Device pixels per device-independent pixel for the window `hwnd`. AppWindow
 * sizes in physical pixels; this gives the scale before any content has
 * loaded, when XamlRoot's scale is not yet known.
 */
export function scaleOf(hwnd: bigint) {
  const result = getDpiForWindow.invoke([DynWin32.handle(hwnd)]).returnValue;
  const dpi = result === null ? BASE_DPI : DynWin32.toNumber(result);
  return dpi > 0 ? dpi / BASE_DPI : 1;
}

/**
 * Makes the window `owner` own the window `hwnd`: the owned window stays above
 * its owner, and closes, minimizes and restores with it.
 */
export function ownWindow({ hwnd, owner }: {
  hwnd: bigint;
  owner: bigint;
}) {
  setWindowLongPointer.invoke([DynWin32.handle(hwnd), DynWin32.i32(OWNER_INDEX), DynWin32.i64(owner)]);
}
