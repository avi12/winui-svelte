import AppApp from "./AppApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The app services example for the app subpath: a window that keeps to one
// copy per key (`--key`), counts the copies redirected to it, shows a
// notification on command, and reports high contrast
// (test/app.test.ts starts a second copy and drives it).
export function start(host: ExampleHost) {
  mountControl({
    component: AppApp,
    props: {
      host
    }
  });
}
