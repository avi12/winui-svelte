import TaskbarApp from "./TaskbarApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The taskbar example: a download bar mirrored on the window's taskbar button
// and an unread count drawn over it, driven by buttons and by commands
// (examples/taskbar/TaskbarApp.svelte). test/taskbar.test.ts runs it. It sends
// no input to the desktop.
export function start(host: ExampleHost) {
  mountControl({
    component: TaskbarApp,
    props: {
      host
    }
  });
}
