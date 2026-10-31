import StoresApp from "./StoresApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";
import { installMatchMedia } from "winui-svelte/window";

export function start(host: ExampleHost) {
  installMatchMedia();
  mountControl({
    component: StoresApp,
    props: {
      host
    }
  });
}
