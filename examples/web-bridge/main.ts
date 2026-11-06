import WebBridgeApp from "./WebBridgeApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The web-bridge example: a window whose WebView2 hosts a page that talks to
// the app through winui-svelte/messaging (test/web-bridge.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: WebBridgeApp,
    props: {
      host
    }
  });
}
