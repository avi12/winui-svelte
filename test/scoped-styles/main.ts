import ScopedStylesApp from "./ScopedStylesApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// A window with ListViews whose containers are styled by a class that only a
// Style prop names, scoped, with no :global (test/scoped-styles.test.ts reads
// the containers back).
export function start(host: ExampleHost) {
  mountControl({
    component: ScopedStylesApp,
    props: {
      host
    }
  });
}
