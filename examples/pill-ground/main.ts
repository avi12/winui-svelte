import PillGroundApp from "./PillGroundApp.svelte";
import { mountControl } from "winui-svelte";
import { installAnimations } from "winui-svelte/web-apis/animations";
import { installPage } from "winui-svelte/web-apis/page";

// The pill-ground example: the static markup of the Gemini Live pill
// (HANDOFF-gemini-live.md) on winui-svelte, driven by one `view` object.
// The web APIs it uses are installed first: `element.animate()` for the glow
// and `window.open` for a link chip
export function start() {
  installAnimations();
  installPage();
  mountControl({
    component: PillGroundApp,
    props: {}
  });
}
