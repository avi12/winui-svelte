import HotkeysApp from "./HotkeysApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The hotkeys example: a window that a global hotkey hides and shows, with no
// tray icon (test/hotkeys.test.ts registers an obscure combination, posts the
// message Windows would post for it, and reads the reports back).
export function start(host: ExampleHost) {
  mountControl({
    component: HotkeysApp,
    props: {
      host
    }
  });
}
