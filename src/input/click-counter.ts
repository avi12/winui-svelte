import { doubleClickSettings } from "./native.ts";

const PRIMARY_BUTTON = 0;

/** Where a press happened. */
export interface ClickPoint {
  readonly x: number;
  readonly y: number;
}

/** What `createClickCounter` takes. */
export interface ClickCounterOptions {
  /**
   * The longest time between two presses of a run, in milliseconds; the
   * system's double-click time by default.
   */
  readonly milliseconds?: number;

  /**
   * The farthest apart two presses of a run may be, in the pixels of the
   * points given; the system's double-click distance by default.
   */
  readonly distance?: number;
}

/**
 * Counts consecutive presses. WinUI's pointer events carry no click count, so
 * the count is made here: a press continues the run when it comes within the
 * double-click time and distance of the one before and is of the same button;
 * anything else starts a run of one.
 *
 * @param options - Overrides for the system's double-click settings, each
 * read when left out.
 * @returns A counter whose `press` returns the number of presses in a row
 * this one makes (1 for a lone press, 2 for a double, 3 for a triple).
 */
export function createClickCounter(options: ClickCounterOptions = {}) {
  const milliseconds = options.milliseconds ?? doubleClickSettings().milliseconds;
  const distance = options.distance ?? doubleClickSettings().distance;
  let count = 0;
  let lastTime = -Infinity;
  let lastPoint: ClickPoint | undefined;
  let lastButton = PRIMARY_BUTTON;

  return {
    press({ point, time, button = PRIMARY_BUTTON }: {
      readonly point: ClickPoint;

      /** When the press happened, in milliseconds on any clock that only the caller's presses share. */
      readonly time: number;

      /** The DOM `button`; a different one from the last press resets the count. */
      readonly button?: number;
    }) {
      const isQuick = time - lastTime <= milliseconds;
      const isSameButton = button === lastButton;
      const isNear = lastPoint !== undefined && Math.hypot(point.x - lastPoint.x, point.y - lastPoint.y) <= distance;
      const isContinuing = isQuick && isSameButton && isNear;
      count = isContinuing ? count + 1 : 1;
      lastTime = time;
      lastPoint = point;
      lastButton = button;
      return count;
    }
  };
}
