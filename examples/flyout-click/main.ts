import FlyoutClickApp from "./FlyoutClickApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The flyout-click example: buttons whose flyout opens from their click
// (test/flyout-click.test.ts presses them through UI Automation).
export function start(host: ExampleHost) {
  mountControl({
    component: FlyoutClickApp,
    props: {
      host
    }
  });
}
