import RefusedToggleApp from "./RefusedToggleApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The refused toggle example (test/refused-toggle.test.ts flips the switches the way a user does and reads them back).
export function start(host: ExampleHost) {
  mountControl({
    component: RefusedToggleApp,
    props: {
      host
    }
  });
}
