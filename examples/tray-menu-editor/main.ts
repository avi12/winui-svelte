import TrayMenuEditorApp from "./TrayMenuEditorApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The tray menu editor beside the tray icon it edits: test/tray-menu-editor.test.ts
// changes the profile from code and reads back what the window and the saved
// file say. It sends no input to the desktop.
export function start(host: ExampleHost) {
  mountControl({
    component: TrayMenuEditorApp,
    props: {
      host
    }
  });
}
