import LoopApp from "./LoopApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The loop example: what Node does in the background (files, sockets, http,
// WebSocket, worker messages, child processes) completes on the UI thread
// while an interval animates a control (test/loop.test.ts drives it and reads
// the control back).
export function start(host: ExampleHost) {
  mountControl({
    component: LoopApp,
    props: {
      host
    }
  });
}
