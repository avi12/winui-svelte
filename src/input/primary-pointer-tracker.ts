const PRIMARY_BUTTON = 0;

/**
 * What a pointer's button means: the one that draws and selects, or any other
 * (the right button, a pen's barrel button or eraser).
 */
export const PointerRole = {
  primary: "primary",
  secondary: "secondary"
} as const;

/** One of `PointerRole`'s values. */
export type PointerRole = (typeof PointerRole)[keyof typeof PointerRole];

/** What a press did to the gesture. */
export const PressOutcome = {
  /** The pointer is now the one the gesture follows. */
  started: "started",
  /** A secondary button went down; the gesture is neither started nor changed. */
  secondary: "secondary",
  /** Another pointer is already down, so this one is not followed. */
  ignored: "ignored"
} as const;

/** One of `PressOutcome`'s values. */
export type PressOutcome = (typeof PressOutcome)[keyof typeof PressOutcome];

/** The members of a pointer event that the tracker reads (a `PointerFields` has them). */
export interface PointerReport {
  readonly pointerId: number;

  /** The DOM `button`: 0 is the primary one; a pen's barrel button is 2 and its eraser 5. */
  readonly button: number;
}

/** What `press` says. */
export interface PressResult {
  readonly pointerId: number;
  readonly role: PointerRole;
  readonly outcome: PressOutcome;
}

/** What `move` says. */
export interface MoveResult {
  readonly pointerId: number;

  /** The move belongs to the gesture: it is the followed pointer's, or none is down (hover). */
  readonly isFollowed: boolean;
}

/** What `release` says. */
export interface ReleaseResult {
  readonly pointerId: number;

  /** The followed pointer ended, and with it the gesture. */
  readonly isEnded: boolean;
}

/** The role of the button a press is for. */
export function pointerRoleOf(button: number) {
  return button === PRIMARY_BUTTON ? PointerRole.primary : PointerRole.secondary;
}

/**
 * Follows the first pointer of a gesture: a second finger, a palm or a pen that
 * lands while one is down is ignored, and only a primary button starts a
 * gesture. A mouse's right button, a pen's barrel button and its eraser are all
 * `secondary`, never `primary`; what a secondary press means (cancel, a menu)
 * is the caller's to decide.
 *
 * @returns The tracker; `isActive` tells whether a pointer is being followed.
 */
export function createPrimaryPointerTracker() {
  let activeId: number | undefined;

  return {
    get isActive() {
      return activeId !== undefined;
    },
    press({ pointerId, button }: PointerReport) {
      const role = pointerRoleOf(button);
      const isBusy = activeId !== undefined;
      if (isBusy) {
        return {
          pointerId,
          role,
          outcome: PressOutcome.ignored
        } satisfies PressResult;
      }

      const isSecondary = role === PointerRole.secondary;
      if (isSecondary) {
        return {
          pointerId,
          role,
          outcome: PressOutcome.secondary
        } satisfies PressResult;
      }

      activeId = pointerId;
      return {
        pointerId,
        role,
        outcome: PressOutcome.started
      } satisfies PressResult;
    },
    move(pointerId: number) {
      return {
        pointerId,
        isFollowed: activeId === undefined || activeId === pointerId
      } satisfies MoveResult;
    },
    release(pointerId: number) {
      const isEnded = activeId === pointerId;
      if (isEnded) {
        activeId = undefined;
      }

      return {
        pointerId,
        isEnded
      } satisfies ReleaseResult;
    }
  };
}
