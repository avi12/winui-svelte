import MediaApp from "./MediaApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The media example: a window whose stylesheet, mediaQuery, matchMedia and
// Svelte's own MediaQuery all follow the settings (test/media.test.ts rewrites
// a fake settings file and watches each of them flip).
export function start(host: ExampleHost) {
  mountControl({
    component: MediaApp,
    props: {
      host
    }
  });
}
