import ProgressApp from "./ProgressApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The progress example: an operation bound to a ProgressBar, the taskbar
// button and a second window scoped by group (examples/progress/ProgressApp.svelte).
export function start(host: ExampleHost) {
  mountControl({
    component: ProgressApp,
    props: {
      host
    }
  });
}
