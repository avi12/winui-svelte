import ServicesApp from "./ServicesApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The app services example: a window that follows the system accent color,
// text scale and animation setting, adapts to its own size and theme, and
// opens the file, folder and save dialogs from its handle
// (test/services.test.ts drives what can run without a person at the dialogs).
export function start(host: ExampleHost) {
  mountControl({
    component: ServicesApp,
    props: {
      host
    }
  });
}
