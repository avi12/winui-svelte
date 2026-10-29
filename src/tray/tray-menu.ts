import type { TrayNative } from "./native.ts";

const HOST_SIZE = 1;

/** A point on the screen, in pixels. */
export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/** Where, and how big, the small window that hosts a tray menu is, in device pixels. */
export interface MenuPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** What a `TrayIcon`'s `menu` snippet is given. */
export interface TrayMenuContext {
  /** Closes the menu and the window that hosts it. */
  close(): void;
}

/**
 * The host window's place: at `point`, moved in to lie inside `workArea`. A
 * point on the taskbar, where the tray is, is outside the work area, so the
 * window sits on the work area's edge and the flyout opens away from it.
 */
export function placeMenuWindow({ point, size, workArea }: {
  point: ScreenPoint;
  size: number;
  workArea: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}) {
  const x = Math.min(Math.max(point.x, workArea.left), workArea.right - size);
  const y = Math.min(Math.max(point.y, workArea.top), workArea.bottom - size);
  const placement: MenuPlacement = {
    x,
    y,
    width: size,
    height: size
  };
  return placement;
}

/**
 * The lifecycle of a tray menu: nothing exists until `show`, one host window
 * while it is shown (a second `show` moves it), nothing again after `close`.
 * `onChange` hears the placement to open a host window at, or null to close it.
 */
export function createTrayMenu({ native, onChange }: {
  native: Pick<TrayNative, "workAreaAt">;
  onChange: (placement: MenuPlacement | null) => void;
}) {
  let current: MenuPlacement | null = null;

  function change(placement: MenuPlacement | null) {
    current = placement;
    onChange(placement);
  }

  return {
    /** Opens the menu with its flyout at `point`. */
    show(point: ScreenPoint) {
      change(
        placeMenuWindow({
          point,
          size: HOST_SIZE,
          workArea: native.workAreaAt(point)
        })
      );
    },
    /** Closes the menu; closing a closed one does nothing. */
    close() {
      const isOpen = current !== null;
      if (isOpen) {
        change(null);
      }
    },
    /** Where the host window is, or null while the menu is closed. */
    get placement() {
      return current;
    }
  };
}
