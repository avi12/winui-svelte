import WebApp from "./WebApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The web example: a window with one WebView2 that loads a page and reports
// when it has (test/web.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: WebApp,
    props: {
      host
    }
  });
}
