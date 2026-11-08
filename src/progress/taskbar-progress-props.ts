import type { ProgressSource } from "./progress-source.ts";
import type { TaskbarProgressTarget } from "./taskbar-progress.ts";
import type { WindowHandle } from "#src/window/window-handle.js";

/** The props of `TaskbarProgress`. */
export interface TaskbarProgressProps {
  /** What to show: an operation or a registry; every running operation (the app-wide registry) when left out. */
  readonly of?: ProgressSource;

  /** Shows only the operations of this group, when `of` is left out. */
  readonly group?: string;

  /** The window whose taskbar button shows it; the window this is mounted in when left out. */
  readonly window?: WindowHandle;

  /** A taskbar button to drive directly, such as one `handle.taskbar` gave. */
  readonly taskbar?: TaskbarProgressTarget;
}
