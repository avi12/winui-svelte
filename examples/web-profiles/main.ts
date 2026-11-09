import ProfilesApp from "./ProfilesApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The web-profiles example: a window with two WebView2 controls, each in an
// environment of its own (a profile folder and a Chromium switch), in one
// process (test/web-profiles.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: ProfilesApp,
    props: {
      host
    }
  });
}
