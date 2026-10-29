import TodoApp from "./TodoApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The todo app: Svelte state for the form, host state (saved to a file) for
// the list, a ListView for the rows and overlays for confirming and telling.
// --file <path> says where the list is saved; run it from the package's
// folder (see examples/README.md):
//
//   node --disable-warning=ExperimentalWarning --enable-source-maps \
//     examples/harness/launch.ts examples/todo/main.ts
export function start(host: ExampleHost) {
  mountControl({
    component: TodoApp,
    props: {
      host
    }
  });
}
