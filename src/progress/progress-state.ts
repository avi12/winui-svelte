/**
 * Where an operation is, in the words WinUI's `ProgressBar` and the taskbar
 * button use: running, paused, failed; `idle` before it starts.
 */
export const ProgressState = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  COMPLETE: "complete",
  ERROR: "error",
  CANCELED: "canceled"
} as const;

/** One of the values of `ProgressState`. */
export type ProgressState = (typeof ProgressState)[keyof typeof ProgressState];

/**
 * What a subscriber reads from an operation or from the registry. The
 * `value`, `isIndeterminate`, `showPaused` and `showError` members have the
 * names and meaning of `ProgressBar`'s properties (with `maximum` of 1).
 */
export interface ProgressSnapshot {
  readonly state: ProgressState;

  /** How many operations are unfinished: 0 or 1 for one operation. */
  readonly count: number;

  /** Bytes (or units) done; summed over the operations that know their total, for the registry. */
  readonly loaded: number;

  /** The whole size, or undefined while unknown. */
  readonly total: number | undefined;

  /** How far along, 0 to 1; 1 once complete. */
  readonly value: number;

  /** True while the total is unknown: a marquee, not a bar. */
  readonly isIndeterminate: boolean;
  readonly showPaused: boolean;
  readonly showError: boolean;

  /** What the operation is, when exactly one is unfinished. */
  readonly label: string | undefined;
}

/**
 * Whether an operation has not reached a final state yet.
 *
 * @param state - The state to test.
 * @returns True for idle, running and paused.
 */
export function isUnfinished(state: ProgressState) {
  return state === ProgressState.IDLE || state === ProgressState.RUNNING || state === ProgressState.PAUSED;
}

/**
 * How far along, clamped to 0..1.
 *
 * @param options - The work done and the whole size.
 * @returns 0 when the total is unknown or zero.
 */
export function fractionOf({ loaded, total }: {
  loaded: number;
  total: number | undefined;
}) {
  const isUnknown = total === undefined || total <= 0;
  if (isUnknown) {
    return 0;
  }

  return Math.min(1, Math.max(0, loaded / total));
}
