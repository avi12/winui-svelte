import type { BadgeFace } from "./badge-icon.ts";
import { badgeDescription, renderBadgeIcon } from "./badge-icon.ts";
import { createTaskbarNative } from "./taskbar-native.ts";
import { BadgeGlyph } from "#src/web-apis/badge-glyph.js";
import type { BadgeBackend } from "#src/web-apis/badging.js";
import type { IconPixels } from "#src/win32-icons.js";

/** What a window's taskbar button shows as a progress bar. */
export const TaskbarProgressState = {
  NONE: "none",
  INDETERMINATE: "indeterminate",
  NORMAL: "normal",
  ERROR: "error",
  PAUSED: "paused"
} as const;

/** One of `TaskbarProgressState`'s values. */
export type TaskbarProgressState = (typeof TaskbarProgressState)[keyof typeof TaskbarProgressState];

/** When a flashing taskbar button stops. */
export const TaskbarFlashUntil = {
  COUNT: "count",
  FOREGROUND: "foreground",
  STOPPED: "stopped"
} as const;

/** One of `TaskbarFlashUntil`'s values. */
export type TaskbarFlashUntil = (typeof TaskbarFlashUntil)[keyof typeof TaskbarFlashUntil];

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

/** What `setProgress` takes. */
export interface TaskbarProgressOptions {
  state: TaskbarProgressState;

  /** How far along, 0 to 1 (clamped); ignored for `none` and `indeterminate`. 0 by default. */
  value?: number;
}

/** What `setOverlayIcon` takes. */
export interface TaskbarOverlayOptions {
  /** The path of an .ico file, or null to remove the overlay. */
  icon: string | null;

  /** What a screen reader says for the overlay. */
  description?: string;
}

/** What `flash` takes. */
export interface TaskbarFlashOptions {
  /** How many times to flash when `until` is `count`; 3 by default. */
  count?: number;

  /**
   * `count` (the default) flashes `count` times; `foreground` until the
   * window is brought forward; `stopped` until `stopFlashing`.
   */
  until?: TaskbarFlashUntil;
}

const PROGRESS_TOTAL = 1000;
const DEFAULT_FLASH_COUNT = 3;
const STATE_FLAGS = {
  [TaskbarProgressState.NONE]: 0,
  [TaskbarProgressState.INDETERMINATE]: 1,
  [TaskbarProgressState.NORMAL]: 2,
  [TaskbarProgressState.ERROR]: 4,
  [TaskbarProgressState.PAUSED]: 8
} as const;
const FLASH_STOP = 0;
const FLASH_TRAY = 2;
const FLASH_TIMER = 4;
const FLASH_UNTIL_FOREGROUND = 0xC;
const FLASH_FLAGS = {
  [TaskbarFlashUntil.COUNT]: FLASH_TRAY,
  [TaskbarFlashUntil.FOREGROUND]: FLASH_TRAY | FLASH_UNTIL_FOREGROUND,
  [TaskbarFlashUntil.STOPPED]: FLASH_TRAY | FLASH_TIMER
} as const;

/**
 * The numbers ITaskbarList3 takes for a progress state and a 0 to 1 value.
 *
 * @param options - The state and the value.
 * @returns The state flag and the completed and total counts.
 */
export function progressCall({ state, value = 0 }: TaskbarProgressOptions) {
  const isKnown = Object.hasOwn(STATE_FLAGS, state);
  if (!isKnown) {
    throw new TypeError(`'${String(state)}' is not a taskbar progress state`);
  }

  if (!Number.isFinite(value)) {
    throw new TypeError("the progress value must be a number from 0 to 1");
  }

  const clamped = Math.min(1, Math.max(0, value));
  return {
    state: STATE_FLAGS[state],
    completed: BigInt(Math.round(clamped * PROGRESS_TOTAL)),
    total: BigInt(PROGRESS_TOTAL)
  };
}

/**
 * The FlashWindowEx flags and count for a flash request.
 *
 * @param options - How often and until when.
 * @returns The flags and the count.
 */
export function flashCall({ count = DEFAULT_FLASH_COUNT, until = TaskbarFlashUntil.COUNT }: TaskbarFlashOptions) {
  const isKnown = Object.hasOwn(FLASH_FLAGS, until);
  if (!isKnown) {
    throw new TypeError(`'${String(until)}' is not a taskbar flash mode`);
  }

  const isCount = Number.isSafeInteger(count) && count > 0;
  if (!isCount) {
    throw new TypeError("the flash count must be a positive integer");
  }

  return {
    flags: FLASH_FLAGS[until],
    count: until === TaskbarFlashUntil.COUNT ? count : 0
  };
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
