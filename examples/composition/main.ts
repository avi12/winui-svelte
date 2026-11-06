import CompositionApp from "./CompositionApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The Composition animation example (test/composition.test.ts moves the spring card and reads both
// cards back from the window's pixels).
export function start(host: ExampleHost) {
  mountControl({
    component: CompositionApp,
    props: {
      host
    }
  });
}
