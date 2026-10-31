import KeysApp from "./KeysApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The keys example: the controls the keyboard drives (tab order, a
// KeyboardAccelerator, an access key, a TextBox, a ContentDialog), each one
// reporting what reached it (test/keys.test.ts posts window messages to this
// window and reads the reports back).
export function start(host: ExampleHost) {
  mountControl({
    component: KeysApp,
    props: {
      host
    }
  });
}
