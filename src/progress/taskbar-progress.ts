import type { ProgressSource } from "./progress-source.ts";
import { ProgressState } from "./progress-state.ts";
import type { ProgressSnapshot } from "./progress-state.ts";
import type { TaskbarProgressOptions } from "#src/window/taskbar-calls.js";
import { TaskbarProgressState } from "#src/window/taskbar-calls.js";

const PROGRESS_STEPS = 1000;

/** The part of a window taskbar button that a progress drives: `handle.taskbar` fits. */
export interface TaskbarProgressTarget {
  setProgress(options: TaskbarProgressOptions): void;
}

/**
 * What the taskbar button shows for a snapshot, with the same meaning as a
 * `ProgressBar`: a bar that fills, a marquee when the total is unknown, yellow
 * when paused, red on error, gone when nothing is left.
 *
 * @param snapshot - The state to show.
 * @returns The options for `setProgress`.
 */
export function taskbarOptionsOf(snapshot: ProgressSnapshot) {
  const { state, value, isIndeterminate } = snapshot;
  const isFailed = state === ProgressState.ERROR;
  if (isFailed) {
    return { state: TaskbarProgressState.ERROR } satisfies TaskbarProgressOptions;
  }

  const isPaused = state === ProgressState.PAUSED;
  if (isPaused) {
    return {
      state: TaskbarProgressState.PAUSED,
      value
    } satisfies TaskbarProgressOptions;
  }

  const isNotRunning = state !== ProgressState.RUNNING;
  if (isNotRunning) {
    return { state: TaskbarProgressState.NONE } satisfies TaskbarProgressOptions;
  }

  if (isIndeterminate) {
    return { state: TaskbarProgressState.INDETERMINATE } satisfies TaskbarProgressOptions;
  }

  return {
    state: TaskbarProgressState.NORMAL,
    value
  } satisfies TaskbarProgressOptions;
}

/**
 * Shows a source on a taskbar button until the returned function is called;
 * the shell is told only when the bar moves by a step (a thousandth) or the
 * state changes. `<TaskbarProgress />` is this in markup.
 *
 * @param options - The operation or registry, and the window taskbar button.
 * @returns Stops following the source and clears the bar.
 */
export function bindTaskbarProgress({ source, taskbar }: {
  source: ProgressSource;
  taskbar: TaskbarProgressTarget;
}) {
  let lastKey = `${TaskbarProgressState.NONE}:0`;
  const stop = source.subscribe(snapshot => {
    const options = taskbarOptionsOf(snapshot);
    const key = `${options.state}:${Math.floor(("value" in options ? options.value : 0) * PROGRESS_STEPS)}`;
    const isSame = key === lastKey;
    if (isSame) {
      return;
    }

    lastKey = key;
    taskbar.setProgress(options);
  });
  return () => {
    stop();
    taskbar.setProgress({ state: TaskbarProgressState.NONE });
  };
}
