import type { BadgeFace } from "./badge-icon.ts";
import { badgeDescription, renderBadgeIcon } from "./badge-icon.ts";
import type { TaskbarFlashOptions, TaskbarProgressOptions } from "./taskbar-calls.ts";
import { FLASH_STOP, flashCall, progressCall } from "./taskbar-calls.ts";
import { createTaskbarNative } from "./taskbar-native.ts";
import type { PictureSource } from "#src/picture-source.js";
import { BadgeGlyph } from "#src/web-apis/badge-glyph.js";
import type { BadgeBackend } from "#src/web-apis/badging.js";
import type { IconPixels } from "#src/win32-icons.js";

export type { TaskbarFlashOptions, TaskbarProgressOptions } from "./taskbar-calls.ts";
export { TaskbarFlashUntil, TaskbarProgressState } from "./taskbar-calls.ts";

/** The icon on an overlay: an .ico file, or pixels already drawn. */
export type TaskbarOverlayIcon = {
  readonly path: string;
} | IconPixels;

/** The shell calls a taskbar button makes; a test stands in for Windows. */
export interface TaskbarBackend {
  /** Pixels of an overlay icon at the system scale. */
  smallIconSize(): number;
  setProgress(options: {
    hwnd: bigint;
    state: number;
    completed: bigint;
    total: bigint;
  }): void;

  /** `icon` null removes the overlay. */
  setOverlay(options: {
    hwnd: bigint;
    icon: TaskbarOverlayIcon | null;
    description: string;
  }): void;
  flash(options: {
    hwnd: bigint;
    flags: number;
    count: number;
  }): void;
}

/** What `setOverlayIcon` takes. */
export interface TaskbarOverlayOptions {
  /** The path of an .ico file, or null to remove the overlay. */
  icon: PictureSource | null;

  /** What a screen reader says for the overlay. */
  description?: string;
}

/**
 * One window's button on the taskbar: its progress bar, its overlay icon and
 * its flashing. Needs no package identity. Call it on the UI thread.
 */
export class TaskbarButton {
  private readonly hwnd: bigint;
  private readonly backend: TaskbarBackend;

  constructor({ hwnd, backend }: {
    hwnd: bigint;
    backend: TaskbarBackend;
  }) {
    this.hwnd = hwnd;
    this.backend = backend;
  }

  /**
   * Shows a progress bar on the button: `normal` fills to `value` (0 to 1),
   * `error` and `paused` fill it red or yellow, `indeterminate` runs a
   * marquee, `none` takes the bar away.
   *
   * @param options - The state and the value.
   */
  setProgress(options: TaskbarProgressOptions) {
    this.backend.setProgress({
      hwnd: this.hwnd,
      ...progressCall(options)
    });
  }

  /**
   * Draws a small icon over the button's corner, or takes it away.
   *
   * @param options - The .ico path (null removes it) and the description for screen readers.
   */
  setOverlayIcon({ icon, description = "" }: TaskbarOverlayOptions) {
    this.backend.setOverlay({
      hwnd: this.hwnd,
      icon: icon === null ? null : { path: icon },
      description
    });
  }

  /**
   * Draws a count or a status glyph over the button's corner, in the look of
   * Windows' own badge.
   *
   * @param face - A count (above 99 shows 99+) or a glyph.
   */
  setOverlayBadge(face: BadgeFace) {
    this.backend.setOverlay({
      hwnd: this.hwnd,
      icon: renderBadgeIcon({
        size: this.backend.smallIconSize(),
        face
      }),
      description: badgeDescription(face)
    });
  }

  /** Takes the overlay away. */
  clearOverlay() {
    this.setOverlayIcon({ icon: null });
  }

  /**
   * Flashes the button to ask for attention.
   *
   * @param options - How many times, or until the window is brought forward or `stopFlashing` is called.
   */
  flash(options: TaskbarFlashOptions = {}) {
    this.backend.flash({
      hwnd: this.hwnd,
      ...flashCall(options)
    });
  }

  /** Stops the button flashing. */
  stopFlashing() {
    this.backend.flash({
      hwnd: this.hwnd,
      flags: FLASH_STOP,
      count: 0
    });
  }
}

/**
 * A badge for `installBadging`'s `fallback` that draws on a window's taskbar
 * button: what `navigator.setAppBadge` does for an app with no package
 * identity.
 *
 * @param button - The window's taskbar button.
 * @returns The backend.
 */
export function taskbarBadgeBackend(button: TaskbarButton) {
  return {
    setCount: count => button.setOverlayBadge({ count }),
    setGlyph(glyph) {
      const isNone = glyph === BadgeGlyph.NONE;
      if (isNone) {
        button.clearOverlay();
        return;
      }

      button.setOverlayBadge({ glyph });
    },
    clear: () => button.clearOverlay()
  } satisfies BadgeBackend;
}

/**
 * A window's taskbar button over the real shell. `handle.taskbar` is this for
 * the handle's window.
 *
 * @param hwnd - The window's handle (`appWindow.id.value`).
 * @returns The button.
 */
export function createTaskbarButton(hwnd: bigint) {
  return new TaskbarButton({
    hwnd,
    backend: createTaskbarNative()
  });
}
