import { extendFrameIntoWholeWindow, setRoundedCorners } from "./native.ts";
import { ensureSystemDispatcherQueue } from "./system-dispatcher-queue.ts";
import { write } from "#src/renderer/host/reflect.js";
import type { Window } from "#src/winui.js";
import { ICompositionSupportsSystemBackdrop, SystemCompositor } from "#src/winui.js";

// The Windows App SDK's own Microsoft.UI.Xaml.Media.TransparentTintBackdrop is
// not in the metadata of any release this package restores (2.2 and 2.3 have
// DesktopAcrylicBackdrop, MicaBackdrop and the abstract SystemBackdrop only),
// so it cannot be generated. What it does is what a window offers through
// ICompositionSupportsSystemBackdrop: a composition brush placed behind the
// content, one of the system's (Windows.UI.Composition) and not of the window's
// own compositor (Microsoft.UI.Composition), which is what the interface takes.
// A color brush with alpha 0 there makes the window show the desktop through
// every pixel the content leaves clear, with per-pixel alpha, but only once the
// window manager draws the whole window as its frame
// (DwmExtendFrameIntoClientArea): otherwise the window's own surface under the
// island is opaque and the clear pixels read black (measured on Windows 11
// build 26300 with the Windows App SDK 2.6.5 runtime, by a screen capture over
// a bright window). With the frame extended, Windows 11 also draws its rounded
// corners, outline and shadow round the whole window, which are turned off
// again: a transparent window shows only what its content paints.

const CLEAR = {
  a: 0,
  r: 0,
  g: 0,
  b: 0
};

/**
 * Makes the frame of the window `hwnd` as see-through as its backdrop: the
 * whole window is the window manager's frame, drawn with no rounded corners,
 * outline or shadow. WinUI's presenter undoes it when it takes the border and
 * title bar away, so whoever changes those calls this again.
 */
export function applyTransparentFrame(hwnd: bigint) {
  extendFrameIntoWholeWindow({
    hwnd,
    isExtended: true
  });
  setRoundedCorners({
    hwnd,
    isRounded: false
  });
}

/**
 * Puts a fully transparent system backdrop behind `window`'s content: the
 * desktop shows through wherever the content paints nothing, and a partly
 * transparent pixel blends with it. The window must have no XAML backdrop of
 * its own (`applyBackdrop` takes it away first).
 *
 * @returns What takes the backdrop away again.
 */
export function attachTransparentBackdrop(window: Window) {
  ensureSystemDispatcherQueue();
  const target = window.as(ICompositionSupportsSystemBackdrop);
  target.systemBackdrop = new SystemCompositor().createColorBrush(CLEAR);
  const hwnd = window.appWindow.id.value;
  applyTransparentFrame(hwnd);
  return () => {
    setRoundedCorners({
      hwnd,
      isRounded: true
    });
    extendFrameIntoWholeWindow({
      hwnd,
      isExtended: false
    });
    // The binding types the property as non-null, but null is how the target
    // lets a backdrop go.
    write(target, "systemBackdrop", null);
  };
}
