import ScrollTimelineApp from "./ScrollTimelineApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

export function start(host: ExampleHost) {
  mountControl({
    component: ScrollTimelineApp,
    props: {
      host
    }
  });
}
