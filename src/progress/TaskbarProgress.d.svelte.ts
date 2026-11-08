import type { TaskbarProgressProps } from "./taskbar-progress-props.ts";
import type { Component } from "svelte";

declare const TaskbarProgress: Component<TaskbarProgressProps, Record<string, never>, "">;
// eslint-disable-next-line no-restricted-exports -- Svelte declares a component as the default export
export default TaskbarProgress;
