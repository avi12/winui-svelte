import ShadowsApp from "./ShadowsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// Cards with a box-shadow of their own colour, offset, blur and spread, drawn by
// a Composition DropShadow, and one with a ThemeShadow that falls on a named
// receiver (test/shadows.test.ts reads the pixels).
export function start(host: ExampleHost) {
  mountControl({
    component: ShadowsApp,
    props: {
      host
    }
  });
}
