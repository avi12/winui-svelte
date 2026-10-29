import TreeApp from "./TreeApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The tree example: a window with a TreeView of items, each a Svelte component
// (test/tree.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: TreeApp,
    props: {
      host
    }
  });
}
