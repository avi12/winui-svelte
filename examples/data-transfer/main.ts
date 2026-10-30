import DataTransferApp from "./DataTransferApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The data transfer example: a drop zone, a raw element with the web's drop
// events, a draggable text and a file picker button
// (test/data-transfer.test.ts drops a data package on it without any input).
export function start(host: ExampleHost) {
  mountControl({
    component: DataTransferApp,
    props: {
      host
    }
  });
}
