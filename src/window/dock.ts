import type { WindowAnchor } from "./anchor.ts";
import { dockedBounds } from "./anchor.ts";
import { foregroundWindowHandle } from "./native.ts";
import type { AppWindow } from "#src/winui.js";
import { DisplayArea, DisplayAreaFallback } from "#src/winui.js";

/**
 * Which display a window is docked to: the one the user is working on (the
 * foreground window's), the one the window is on, or the primary one.
 */
export const DockDisplay = {
  active: "active",
  current: "current",
  primary: "primary"
} as const;

/** One of `DockDisplay`'s values. */
export type DockDisplay = (typeof DockDisplay)[keyof typeof DockDisplay];

const NO_WINDOW = 0n;

function activeDisplayArea(appWindow: AppWindow) {
  const foreground = foregroundWindowHandle();
  const hasForeground = foreground !== NO_WINDOW;
  const windowId = hasForeground ? { value: foreground } : appWindow.id;
  return DisplayArea.getFromWindowId(windowId, DisplayAreaFallback.Nearest);
}

const DISPLAY_FINDERS = {
  [DockDisplay.active]: activeDisplayArea,
  [DockDisplay.current]: appWindow => DisplayArea.getFromWindowId(appWindow.id, DisplayAreaFallback.Nearest),
  [DockDisplay.primary]: () => DisplayArea.primary
} as const satisfies Record<DockDisplay, (appWindow: AppWindow) => DisplayArea>;

/**
 * The display area `display` names for `appWindow`. The `active` one is the
 * display of the foreground window, so an overlay that shows up while the user
 * works on a second monitor lands there.
 *
 * @param options - The window and which display to find.
 * @returns The WinUI `DisplayArea`: `workArea` is its desktop minus the taskbar, in device pixels.
 */
export function displayAreaOf({ appWindow, display }: {
  appWindow: AppWindow;
  display: DockDisplay;
}) {
  return DISPLAY_FINDERS[display](appWindow);
}

/** Where `dockWindow` puts a window. */
export interface DockOptions {
  /** The corner of the work area the window sits against. */
  anchor: WindowAnchor;

  /** Device pixels between the window and the two edges at that corner; 0 by default. */
  inset?: number;

  /** The display to dock to; the active one by default. */
  display?: DockDisplay;
}

/**
 * Moves the window against the `anchor` corner of a display's work area (the
 * display minus the taskbar), `inset` device pixels in from both edges, with
 * one `AppWindow.MoveAndResize`. The window keeps its size.
 *
 * A window moved to a display with another scale first goes there at its old
 * size and is docked once Windows has rescaled it, so the corner it ends on is
 * the one asked for at the size it really has.
 *
 * @param options - The window, the corner, the inset in device pixels (0 by
 * default) and the display (the active one by default).
 */
export function dockWindow({ appWindow, anchor, inset = 0, display = DockDisplay.active }: DockOptions & {
  appWindow: AppWindow;
}) {
  const area = displayAreaOf({
    appWindow,
    display
  });
  const { workArea } = area;
  const currentArea = DisplayArea.getFromWindowId(appWindow.id, DisplayAreaFallback.Nearest);
  const isOnOtherDisplay = currentArea.displayId.value !== area.displayId.value;
  if (isOnOtherDisplay) {
    appWindow.move({
      x: workArea.x,
      y: workArea.y
    });
  }

  appWindow.moveAndResize(
    dockedBounds({
      area: workArea,
      size: appWindow.size,
      anchor,
      inset
    })
  );
}
