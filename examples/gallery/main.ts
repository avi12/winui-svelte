import GalleryApp from "./GalleryApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The gallery: a NavigationView with a page per area of the library. Run it
// from the package's folder (see examples/README.md):
//
//   node --disable-warning=ExperimentalWarning --enable-source-maps \
//     examples/harness/launch.ts examples/gallery/main.ts
export function start(host: ExampleHost) {
  mountControl({
    component: GalleryApp,
    props: {
      host
    }
  });
}
