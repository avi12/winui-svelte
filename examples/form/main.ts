import FormApp from "./FormApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The form example: a sign-up form whose controls join a Form by name
// (test/forms.test.ts fills it in through UI Automation and reads back the
// submitted data and the error texts).
export function start(host: ExampleHost) {
  mountControl({
    component: FormApp,
    props: {
      host
    }
  });
}
