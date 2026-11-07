import IncrementalListApp from "./IncrementalListApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The incremental list example: a ListView whose items arrive in batches as it
// scrolls (test/incremental-list.test.ts drives it off screen).
export function start(host: ExampleHost) {
  mountControl({
    component: IncrementalListApp,
    props: {
      host
    }
  });
}
