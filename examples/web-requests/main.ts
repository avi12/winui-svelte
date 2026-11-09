import WebRequestsApp from "./WebRequestsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The web-requests example: a window whose WebView2 loads a page from a local
// server with one request blocked, and takes typed input over the DevTools
// protocol (test/web-requests.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: WebRequestsApp,
    props: {
      host
    }
  });
}
