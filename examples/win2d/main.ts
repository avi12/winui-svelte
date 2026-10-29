import Win2DApp from "./Win2DApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The Win2D example: a window with a Canvas that draws shapes, a text, a
// gradient and a blurred bitmap, and redraws when its state changes
// (test/win2d.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: Win2DApp,
    props: {
      host
    }
  });
}
