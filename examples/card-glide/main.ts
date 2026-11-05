import CardGlideApp from "./CardGlideApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The card height glide example (test/card-glide.test.ts samples the card's height while its text grows and shrinks).
export function start(host: ExampleHost) {
  mountControl({
    component: CardGlideApp,
    props: {
      host
    }
  });
}
