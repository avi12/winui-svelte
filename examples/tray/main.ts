import TrayApp from "./TrayApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The tray example: a window and a tray icon with a tooltip, driven by
// commands (examples/tray/TrayApp.svelte). test/tray.test.ts runs it and asks
// the shell, with Shell_NotifyIconGetRect, whether the icon is there. It sends
// no input to the desktop.
export function start(host: ExampleHost) {
  mountControl({
    component: TrayApp,
    props: {
      host
    }
  });
}
