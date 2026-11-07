import TrayMenuApp from "./TrayMenuApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The tray menu model drawn as a MenuFlyout (examples/tray-menu/TrayMenuApp.svelte):
// test/tray-menu.test.ts opens it at a point with the window not activated and
// reads the flyout's items back. It sends no input to the desktop.
export function start(host: ExampleHost) {
  mountControl({
    component: TrayMenuApp,
    props: {
      host
    }
  });
}
