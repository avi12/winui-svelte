import PackagedWin2DApp from "./PackagedWin2DApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The smallest app that needs Win2D in a packaged process: a CSS blur on an
// element and a Canvas that draws through a GaussianBlurEffect. Unpackaged
// both work from PATH; packaged they need the manifest of
// `win2dActivatableClasses` (test/win2d-packaged.test.ts runs it both ways).
export function start(host: ExampleHost) {
  mountControl({
    component: PackagedWin2DApp,
    props: {
      host
    }
  });
}
