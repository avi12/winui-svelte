import NavigationApp from "./NavigationApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The navigation example: a NavigationView whose items navigate a Navigator,
// and whose back button goes back (test/navigation.test.ts drives it and reads
// the page, the history and how many components each page has made).
export function start(host: ExampleHost) {
  mountControl({
    component: NavigationApp,
    props: {
      host
    }
  });
}
