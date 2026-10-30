import { addExtendedStyles, virtualScreen } from "./native.ts";

const WS_EX_TOOLWINDOW = 0x80n;
const WS_EX_NOACTIVATE = 0x08000000n;
// Clear of every display, however they are arranged: left of the rectangle
// that holds them all.
const CLEARANCE = 2000;

/**
 * Where a window of `size` sits so that no display shows any of it: left of
 * the virtual screen, which no monitor extends past.
 */
export function backgroundPlacement(size: {
  width: number;
  height: number;
}) {
  const screen = virtualScreen();
  return {
    x: screen.left - size.width - CLEARANCE,
    y: screen.top,
    width: size.width,
    height: size.height
  };
}

/**
 * Takes the window `hwnd` out of the user's way: it can never be activated
 * by a click and has no taskbar button or Alt+Tab entry. Call it before the
 * first show.
 */
export function keepInBackground(hwnd: bigint) {
  addExtendedStyles({
    hwnd,
    styles: WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE
  });
}
