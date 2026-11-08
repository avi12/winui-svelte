import { fractionOf, isUnfinished, ProgressState } from "./progress-state.ts";
import type { ProgressSnapshot } from "./progress-state.ts";

function sum(values: readonly number[]) {
  let total = 0;
  for (const value of values) {
    total += value;
  }

  return total;
}

function stateOf({ unfinished, failedCount }: {
  unfinished: readonly ProgressSnapshot[];
  failedCount: number;
}) {
  const isNothingLeft = unfinished.length === 0;
  if (isNothingLeft) {
    return failedCount > 0 ? ProgressState.ERROR : ProgressState.IDLE;
  }

  const isRunning = unfinished.some(({ state }) => state === ProgressState.RUNNING);
  if (isRunning) {
    return ProgressState.RUNNING;
  }

  const isPaused = unfinished.every(({ state }) => state === ProgressState.PAUSED);
  return isPaused ? ProgressState.PAUSED : ProgressState.IDLE;
}

/**
 * One snapshot for many: the overall bar of the taskbar and the count of a
 * tray item. The bar covers the operations that know their total (their
 * loaded bytes over their total bytes); it is indeterminate only when none
 * does. It is `running` while any runs, `paused` when all unfinished ones are,
 * and `error` when only failed ones are left.
 *
 * @param snapshots - The snapshots of the operations the registry holds.
 * @returns The aggregate.
 */
export function aggregateSnapshots(snapshots: readonly ProgressSnapshot[]) {
  const unfinished = snapshots.filter(({ state }) => isUnfinished(state));
  const failedCount = snapshots.filter(({ state }) => state === ProgressState.ERROR).length;
  const known = unfinished.filter(({ total }) => total !== undefined && total > 0);
  const loaded = sum(known.map(snapshot => snapshot.loaded));
  const total = sum(known.map(snapshot => snapshot.total ?? 0));
  const state = stateOf({
    unfinished,
    failedCount
  });
  const isMoving = state === ProgressState.RUNNING || state === ProgressState.PAUSED;
  const [only] = unfinished;
  const isSingle = unfinished.length === 1;
  return {
    state,
    count: unfinished.length,
    loaded,
    total: known.length > 0 ? total : undefined,
    value: fractionOf({
      loaded,
      total
    }),
    isIndeterminate: isMoving && known.length === 0,
    showPaused: state === ProgressState.PAUSED,
    showError: failedCount > 0,
    label: isSingle ? only?.label : undefined
  } satisfies ProgressSnapshot;
}
