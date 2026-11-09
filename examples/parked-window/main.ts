import ParkedApp from "./ParkedApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The parked-window example: a parked or hidden window whose WebView2 page reports
// its heartbeat (test/parked-window.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: ParkedApp,
    props: {
      host
    }
  });
}
