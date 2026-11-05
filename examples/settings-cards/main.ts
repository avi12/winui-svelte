import SettingsCardsApp from "./SettingsCardsApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The settings cards example (test/settings-cards.test.ts measures the cards and reads their automation names).
export function start(host: ExampleHost) {
  mountControl({
    component: SettingsCardsApp,
    props: {
      host
    }
  });
}
