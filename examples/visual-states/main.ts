import VisualStatesApp from "./VisualStatesApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// A button and a card (a button with a layout inside) whose :hover, :active and
// :disabled colors are written as CSS and drawn by the visual states of their
// templates (test/visual-states.test.ts enters each state and reads the brush).
export function start(host: ExampleHost) {
  mountControl({
    component: VisualStatesApp,
    props: {
      host
    }
  });
}
