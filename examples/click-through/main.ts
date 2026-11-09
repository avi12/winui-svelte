import ClickThroughApp from "./ClickThroughApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// A transparent, click-through window that is only a 3 px ring (test/click-through.test.ts
// opens it over a bright window and asks Windows what a click would reach)
export const IS_BARE = true;

export function start(host: ExampleHost) {
  mountControl({
    component: ClickThroughApp,
    props: {
      host
    }
  });
}
