import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";

// The window's only flat Win32 calls: the rest is WinUI's own API.

const BASE_DPI = 96;

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
