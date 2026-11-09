import RecoveryApp from "./RecoveryApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The web-recovery example: a WebView2 kept alive through browser crashes
// (test/web-recovery.test.ts kills its browser process and checks it returns).
export function start(host: ExampleHost) {
  mountControl({
    component: RecoveryApp,
    props: {
      host
    }
  });
}
