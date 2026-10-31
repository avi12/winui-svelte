import FrameApp from "./FrameApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The window frame example: a bare <Window> with a title bar and a grid in it,
// and nothing registered by hand (test/window-frame.test.ts opens it).
export const IS_BARE = true;

export function start(host: ExampleHost) {
  mountControl({
    component: FrameApp,
    props: {
      host
    }
  });
}
