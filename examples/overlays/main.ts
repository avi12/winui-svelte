import OverlaysApp from "./OverlaysApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The overlays example: a window whose flyouts and ContentDialogs open from
// state (test/overlays.test.ts drives it).
export function start(host: ExampleHost) {
  mountControl({
    component: OverlaysApp,
    props: {
      host
    }
  });
}
