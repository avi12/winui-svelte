import PillGroundApp from "./PillGroundApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";
import { installAnimations } from "winui-svelte/web-apis/animations";
import { installPage } from "winui-svelte/web-apis/page";

// The pill-ground example: the Gemini Live pill (HANDOFF-gemini-live.md) on
// winui-svelte, in one transparent window that follows its content, driven by
// one `view` object. test/pill-ground.test.ts opens it and sends commands.
// The web APIs it uses are installed first: `element.animate()` for the glow
// and `window.open` for a link chip
export function start(host: ExampleHost) {
  installAnimations();
  installPage();
  mountControl({
    component: PillGroundApp,
    props: {
      host
    }
  });
}
