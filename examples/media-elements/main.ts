import MediaApp from "./MediaApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";

// The media example: Images from bytes, a data URI, a file path and an SVG,
// and a MediaPlayer with no window that plays a generated WAV
// (test/media-elements.test.ts checks it).
export function start(host: ExampleHost) {
  mountControl({
    component: MediaApp,
    props: {
      host
    }
  });
}
