import SettingsApp from "./SettingsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The settings app: a NavigationView whose items are pages of forms, a theme
// switch that restyles the whole window, and a window with its own title bar.
// Run it from the package's folder (see examples/README.md):
//
//   node --disable-warning=ExperimentalWarning --enable-source-maps \
//     examples/harness/launch.ts examples/settings/main.ts
export function start(host: ExampleHost) {
  mountControl({
    component: SettingsApp,
    props: {
      host
    }
  });
}
