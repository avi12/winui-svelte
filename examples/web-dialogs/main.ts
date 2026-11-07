import WebDialogsApp from "./WebDialogsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";
import { installDialogs } from "winui-svelte/dialogs";

// The dialogs example: a window whose dialogs a test opens and closes by
// commands, through the abort signal and never by input.
// test/web-dialogs.test.ts drives it. The web API is installed before the mount
export function start(host: ExampleHost) {
  installDialogs();
  mountControl({
    component: WebDialogsApp,
    props: {
      host
    }
  });
}
