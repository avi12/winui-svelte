import { compileSvelte } from "./compile.ts";
import { WINDOW_ENVIRONMENT, windowConfig, winuiPluginOptions, winuiSvelte } from "./plugin.ts";
import { patchSvelteRuntime } from "./runtime-patch.ts";
import { cssHash } from "#src/css/runtime/sheet-module.js";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// What the Vite plugin tells Svelte's own plugin, and the environment it sets
// up, without starting Vite.

test("components compile for the client, with the stock Svelte compiler", () => {
  const { compile } = winuiPluginOptions();
  assert.equal(compile.generate, "client");
  assert.equal(compile.cssHash, cssHash);
  assert.equal(compile.experimental, undefined);
});

test("the plugin brings Svelte's own with its environment", () => {
  const names = winuiSvelte().map(plugin => plugin.name);
  assert.ok(names.includes("winui-svelte:environment"));
  assert.ok(names.includes("winui-svelte:svelte"));
  assert.ok(names.includes("winui-svelte:css"));
  assert.ok(names.length > 1);
});

test("the window's module environment resolves Svelte's browser build", () => {
  const { resolve, environments } = windowConfig();
  assert.deepEqual(resolve, { conditions: ["browser", "svelte"] });
  assert.deepEqual(environments, {
    [WINDOW_ENVIRONMENT]: {
      consumer: "server",
      resolve: {
        conditions: ["browser", "svelte", "development"],
        noExternal: [/^svelte(?:\/|$)/u, "esm-env", "winui-svelte"]
      },
      dev: {
        moduleRunnerTransform: true
      }
    }
  });
});

test("a bundled component carries the statements that register its <style>", () => {
  const component = path.join(import.meta.dirname, "styled.svelte");
  const code = compileSvelte({
    filename: component,
    source: "<border class=\"a\"></border>\n<style>\n  .a { padding: 4px }\n</style>\n"
  });
  assert.match(code, /registerStyleSheet as registerWinuiSheet \} from "winui-svelte\/css"/u);
  assert.match(code, /"id":"styled\.svelte"/u);
});

test("a <style> WinUI cannot say fails the bundle with the rule's line", () => {
  const component = path.join(import.meta.dirname, "broken.svelte");
  assert.throws(
    () => compileSvelte({
      filename: component,
      source: "<border class=\"a\"></border>\n<style>\n  .a { float: left }\n</style>\n"
    }),
    /^Error: broken\.svelte:3:8: float has no WinUI meaning/u
  );
});

test("Svelte's runtime is read with the event edits, and a changed Svelte is refused", () => {
  const filename = "/app/node_modules/svelte/src/internal/client/dom/elements/attributes.js";
  const source = "function handle(evt) {\n\t\t\t\t\tcurrent[key].call(this, evt);\n}";
  assert.match(
    patchSvelteRuntime({
      filename,
      source
    }), /handle[(][.][.][.]args[)]/u
  );
  assert.throws(() => patchSvelteRuntime({
    filename,
    source: "function handle() {}"
  }), /cannot read this Svelte/u);
  assert.equal(
    patchSvelteRuntime({
      filename: "/app/other.js",
      source
    }), source
  );
});

test("a compiled component ends with a source map that names its file", () => {
  const component = path.join(import.meta.dirname, "mapped.svelte");
  const code = compileSvelte({
    filename: component,
    source: "<border class=\"a\"></border>\n<style>\n  .a { padding: 4px }\n</style>\n"
  });
  const lines = code.trimEnd().split("\n");
  const encoded = lines.at(-1)?.replace("//# sourceMappingURL=data:application/json;base64,", "") ?? "";
  const map = z.object({ sources: z.array(z.string()) }).parse(JSON.parse(Buffer.from(encoded, "base64").toString("utf8")));
  assert.deepEqual(map.sources.map(source => path.basename(source)), ["mapped.svelte"]);
});

test("transition:, in:, out: and animate: fail with the attachments to use instead", () => {
  const component = path.join(import.meta.dirname, "fading.svelte");
  assert.throws(
    () => compileSvelte({
      filename: component,
      source: "<script>\n  import { fade } from \"svelte/transition\";\n</script>\n<border transition:fade></border>\n"
    }),
    /fading\.svelte:4: transition:, in:, out: and animate: need the browser's Element\.animate\(\); use the transition, intro and outro attachments/u
  );
});
