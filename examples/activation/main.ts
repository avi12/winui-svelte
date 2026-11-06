import ActivationApp from "./ActivationApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The activation example: one window that opens `.note` files and `note:`
// links, whether the app was started by them or a later copy was
// (test/activation.test.ts starts a second copy and drives it). The buttons
// register and unregister the scheme and the file type for the current user.
export function start(host: ExampleHost) {
  mountControl({
    component: ActivationApp,
    props: {
      host
    }
  });
}
