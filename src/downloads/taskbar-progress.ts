import type { DownloadProgress } from "./fetch-to-file.ts";
import type { TaskbarProgressOptions } from "#src/window/taskbar-calls.js";
import { TaskbarProgressState } from "#src/window/taskbar-calls.js";

const PROGRESS_STEPS = 1000;

/** The part of a window's taskbar button that a download drives: `handle.taskbar` fits. */
export interface DownloadTaskbar {
  setProgress(options: TaskbarProgressOptions): void;
}

/**
 * Drives a taskbar button from a transfer's progress: a bar that fills (a
 * marquee when the total is unknown), removed when it ends, red when it fails.
 *
 * @param taskbar - A window's taskbar button, or undefined for none.
 * @returns The two calls: `update` after every chunk and `end` once.
 */
export function taskbarReporter(taskbar: DownloadTaskbar | undefined) {
  let lastStep = -1;
  return {
    update({ loaded, total }: DownloadProgress) {
      const isHidden = taskbar === undefined;
      if (isHidden) {
        return;
      }

      const isUnknown = total === undefined || total === 0;
      if (isUnknown) {
        taskbar.setProgress({ state: TaskbarProgressState.INDETERMINATE });
        return;
      }

      const step = Math.floor(loaded / total * PROGRESS_STEPS);
      const isSameStep = step === lastStep;
      if (isSameStep) {
        return;
      }

      lastStep = step;
      taskbar.setProgress({
        state: TaskbarProgressState.NORMAL,
        value: loaded / total
      });
    },
    end(state: TaskbarProgressState) {
      taskbar?.setProgress({ state });
    }
  };
}
