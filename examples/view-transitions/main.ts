import ViewTransitionsApp from "./ViewTransitionsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";
import { installViewTransitions } from "winui-svelte/view-transitions";

// The view transitions example: a list of photos that opens one as a detail
// page, the photo flying from the list to its place through
// `document.startViewTransition`. test/view-transitions.test.ts drives it by
// commands and reads its pixels. The web API is installed before the mount
export function start(host: ExampleHost) {
  installViewTransitions();
  mountControl({
    component: ViewTransitionsApp,
    props: {
      host
    }
  });
}
