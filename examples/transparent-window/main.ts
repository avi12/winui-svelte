import TransparentApp from "./TransparentApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The smallest transparent window: a borderless tool window with one dark
// card in it and nothing else (test/transparent-window.test.ts opens it over a
// bright window and reads the screen).
export const IS_BARE = true;

export function start(host: ExampleHost) {
  mountControl({
    component: TransparentApp,
    props: {
      host
    }
  });
}
