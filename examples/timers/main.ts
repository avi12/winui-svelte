import TimersApp from "./TimersApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The timers example: a counter driven by setInterval and text set after an
// awaited setTimeout or a fetch, on the UI thread
// (test/timers.test.ts drives it and reads the control back).
export function start(host: ExampleHost) {
  mountControl({
    component: TimersApp,
    props: {
      host
    }
  });
}
