import { ProgressState } from "./progress-state.ts";
import type { ProgressSnapshot } from "./progress-state.ts";

const PERCENT = 100;

/**
 * A line for a menu or a status area: "setup.exe - 45%", "3 operations - 12%",
 * "setup.exe - paused", "setup.exe - failed". A marquee has no percent.
 *
 * @param snapshot - The state to describe.
 * @returns The text.
 */
export function progressText(snapshot: ProgressSnapshot) {
  const { count, label, state, value, isIndeterminate } = snapshot;
  const name = count > 1 ? `${count} operations` : label ?? "Working";
  const isFailed = state === ProgressState.ERROR;
  if (isFailed) {
    return `${name} - failed`;
  }

  const isPaused = state === ProgressState.PAUSED;
  if (isPaused) {
    return `${name} - paused`;
  }

  return isIndeterminate ? name : `${name} - ${Math.round(value * PERCENT)}%`;
}
