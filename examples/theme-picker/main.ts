import ThemePickerApp from "./ThemePickerApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The theme picker example: a ComboBox whose items follow a list that is
// reordered, the way a theme picker follows a reorderable list of themes
// (test/theme-picker.test.ts).
export function start(host: ExampleHost) {
  mountControl({
    component: ThemePickerApp,
    props: {
      host
    }
  });
}
