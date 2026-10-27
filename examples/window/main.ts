import type { ExampleHost } from "../harness/contract.ts";
import WindowApp from "./WindowApp.svelte";
import { mountControl } from "winui-svelte";

// The window example: a titled window with a custom title bar and a backdrop
// (--backdrop acrylic|mica|micaAlt|none), opened off screen and unactivated
// (examples/window/run.ps1 captures it; test/window.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl(WindowApp, { host });
}
