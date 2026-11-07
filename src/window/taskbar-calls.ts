// The numbers the shell calls of a taskbar button take, apart from the calls,
// so they are tested without Windows and stay out of the public entry point.

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

/** What `setProgress` takes. */
export interface TaskbarProgressOptions {
  state: TaskbarProgressState;

  /** How far along, 0 to 1 (clamped); ignored for `none` and `indeterminate`. 0 by default. */
  value?: number;
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
/** The FlashWindowEx flags that stop a flash. */
export const FLASH_STOP = 0;
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

/** The part of the window the taskbar's thumbnail shows, in pixels of its client area. */
export interface TaskbarThumbnailClip {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const MAX_TOOLTIP_CHARACTERS = 259;

/**
 * The rectangle ITaskbarList3 takes for a thumbnail clip.
 *
 * @param clip - The part to show.
 * @returns The left, top, right and bottom edges.
 * @throws {TypeError} When a number is not an integer, a size is not positive or an edge is negative.
 */
export function thumbnailClipCall({ x, y, width, height }: TaskbarThumbnailClip) {
  const isRectangle = [x, y, width, height].every(Number.isSafeInteger) && x >= 0 && y >= 0 && width > 0 && height > 0;
  if (!isRectangle) {
    throw new TypeError("the thumbnail clip needs whole numbers: x and y from 0, width and height above 0");
  }

  return {
    left: x,
    top: y,
    right: x + width,
    bottom: y + height
  };
}

/**
 * Checks the text of a thumbnail tooltip.
 *
 * @param text - The tooltip.
 * @returns The text.
 * @throws {RangeError} When it is longer than Windows shows (259 characters).
 */
export function thumbnailTooltipOf(text: string) {
  const isTooLong = text.length > MAX_TOOLTIP_CHARACTERS;
  if (isTooLong) {
    throw new RangeError(`a thumbnail tooltip holds ${MAX_TOOLTIP_CHARACTERS} characters at most`);
  }

  return text;
}
