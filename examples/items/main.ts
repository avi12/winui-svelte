import ItemsApp from "./ItemsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The items example: a window with one control that shows its items by a
// snippet, the one the `--view` flag names (test/items.test.ts checks each).
export function start(host: ExampleHost) {
  mountControl({
    component: ItemsApp,
    props: {
      host
    }
  });
}
