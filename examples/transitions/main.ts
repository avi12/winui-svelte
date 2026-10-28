import TransitionsApp from "./TransitionsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";
import { enableElementAnimation } from "winui-svelte/element-animation";

// The transitions example: a card that fades and flies in and out of a panel
// (test/transitions.test.ts drives it and reads the card's opacity and whether
// it is still in the panel).
export function start(host: ExampleHost) {
  enableElementAnimation();
  mountControl({
    component: TransitionsApp,
    props: {
      host
    }
  });
}
