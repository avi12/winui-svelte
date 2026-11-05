import FontFaceApp from "./FontFaceApp.svelte";
import StyleApp from "./StyleApp.svelte";
import type { ExampleHost } from "#examples/harness/contract.ts";
import { mountControl } from "winui-svelte";
import { installFontFaces } from "winui-svelte/web-apis/fonts";

// The fonts example: a font file of the app used by its family name, once from
// the `@font-face` of a `<style>` (--view style) and once from `FontFace` and
// `document.fonts.add` of the file --file names (--view face), each next to a TextBlock in the default
// font (test/fonts.test.ts measures them).
export function start(host: ExampleHost) {
  const isStyle = host.options["view"] === "style";
  if (!isStyle) {
    installFontFaces();
  }

  mountControl({
    component: isStyle ? StyleApp : FontFaceApp,
    props: {
      host
    }
  });
}
