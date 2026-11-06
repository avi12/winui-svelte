import TypographyApp from "./TypographyApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The type specimen: WinUI's type ramp from `font: var(--type-*)`, and the
// OpenType features of CSS (`font-variant-*`, `font-feature-settings`) as the
// Typography properties of a TextBlock (test/typography.test.ts measures them).
export function start(host: ExampleHost) {
  mountControl({
    component: TypographyApp,
    props: {
      host
    }
  });
}
