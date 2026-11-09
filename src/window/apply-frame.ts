import { changeExtendedStyles, makeLayeredOpaque } from "./native.ts";

// Tells Windows what a window is besides WinUI's own frame (apply-chrome.ts):
// the extended style bits that keep it out of Alt+Tab and out of the way of
// focus and clicks. A style an app never named is left as the window has it.

/** One extended style, and the `<Window>` prop that turns it on. */
export interface FrameStyle {
  styles: bigint;

  /** Needs the window layered (and opaque) first, as click-through does. */
  isLayered?: boolean;

  /** A window kept in the background has it on whatever the prop says. */
  isKeptInBackground?: boolean;
}

/**
 * Turns `style` on or off for the window `hwnd` as `isOn` says (`undefined`:
 * the app left the prop out); `applied` holds the styles this has turned on,
 * so that a prop that is dropped again puts the window back.
 */
export function applyFrameStyle({ hwnd, style, isOn, isParked, applied }: {
  hwnd: bigint;
  style: FrameStyle;
  isOn: boolean | undefined;

  /** The window is kept in the background (background.ts). */
  isParked: boolean;
  applied: Set<bigint>;
}) {
  const isGiven = isOn !== undefined;
  const isUntouched = !isGiven && !applied.has(style.styles);
  if (isUntouched) {
    return;
  }

  const isKept = style.isKeptInBackground === true && isParked;
  const isWanted = isOn === true || isKept;
  const shouldLayer = isWanted && style.isLayered === true;
  if (shouldLayer) {
    makeLayeredOpaque(hwnd);
  }

  changeExtendedStyles({
    hwnd,
    styles: style.styles,
    isOn: isWanted
  });

  if (isWanted) {
    applied.add(style.styles);
  } else {
    applied.delete(style.styles);
  }
}
