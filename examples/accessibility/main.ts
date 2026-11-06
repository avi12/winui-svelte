import AccessibilityApp from "./AccessibilityApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The accessibility example: a failing and a fixed form, audited at run time
// (test/accessibility.test.ts asks for the findings and listens for the
// notification the announce command raises).
export function start(host: ExampleHost) {
  mountControl({
    component: AccessibilityApp,
    props: {
      host
    }
  });
}
