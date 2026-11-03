import SwapApp from "./SwapApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// A window component that is re-created while the application goes on, as a
// hot update does (test/window-swap.test.ts checks that the process survives).
export function start(host: ExampleHost) {
  mountControl({
    component: SwapApp,
    props: {
      host
    }
  });
}
