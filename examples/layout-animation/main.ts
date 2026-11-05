import LayoutAnimationApp from "./LayoutAnimationApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The implicit layout animation example (test/layout-animation.test.ts reads its pixels).
export function start(host: ExampleHost) {
  mountControl({
    component: LayoutAnimationApp,
    props: {
      host
    }
  });
}
