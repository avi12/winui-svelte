import TransitionsApp from "./TransitionsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The transitions example: a card that flies in and out of a panel under Svelte's own transition:fly
// (test/transitions.test.ts drives it and reads the card's opacity and whether
// it is still in the panel).
export function start(host: ExampleHost) {
  mountControl({
    component: TransitionsApp,
    props: {
      host
    }
  });
}
