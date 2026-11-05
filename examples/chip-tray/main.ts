import ChipTrayApp from "./ChipTrayApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The wrapping chip tray example (test/chip-tray.test.ts reads where each tray puts its chips).
export function start(host: ExampleHost) {
  mountControl({
    component: ChipTrayApp,
    props: {
      host
    }
  });
}
