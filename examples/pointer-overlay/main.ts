import PointerOverlayApp from "./PointerOverlayApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// A transparent, borderless, topmost tool window that counts the pointer
// events of its root grid (test/pointer-overlay.test.ts places it at a
// negative origin and presses the mouse in it).
export const IS_BARE = true;

export function start(host: ExampleHost) {
  mountControl({
    component: PointerOverlayApp,
    props: {
      host
    }
  });
}
