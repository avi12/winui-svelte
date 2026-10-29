import InteractionApp from "./InteractionApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The interaction example: one window of controls wired the ways a Svelte
// component wires them (test/interaction.test.ts drives it through UI
// Automation and reads the controls back).
export function start(host: ExampleHost) {
  mountControl({
    component: InteractionApp,
    props: {
      host
    }
  });
}
