import WindowApp from "./WindowApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The window example: a titled window with a custom title bar and a backdrop
// (--backdrop acrylic|mica|micaAlt|none), opened off screen and unactivated
// (examples/window/run.ps1 captures it; test/window.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: WindowApp,
    props: {
      host
    }
  });
}
