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
  }), /cannot read Svelte .*attributes.js/u);
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

const REGISTRATION = /import \{ enableElementAnimation as winuiEnableElementAnimation \} from "winui-svelte\/element-animation";\nwinuiEnableElementAnimation\(\);/u;

function compiled(source: string) {
  return compileSvelte({
    filename: path.join(import.meta.dirname, "motion.svelte"),
    source
  });
}

test("a component with a transition, in, out or animate directive turns the element animation on", () => {
  for (const directive of ["transition:fade", "in:fade", "out:fade"]) {
    const code = compiled(`<script>\n  import { fade } from "svelte/transition";\n</script>\n<border ${directive}></border>\n`);
    assert.match(code, REGISTRATION, directive);
  }

  const keyed = "<script>\n  import { flip } from \"svelte/animate\";\n  let { ids } = $props();\n</script>\n{#each ids as id (id)}<border animate:flip></border>{/each}\n";
  assert.match(compiled(keyed), REGISTRATION);
});

test("a component that imports svelte/motion turns it on, and one that uses neither does not", () => {
  assert.match(compiled("<script>\n  import { Tween } from \"svelte/motion\";\n  const tween = new Tween(0);\n</script>\n<border></border>\n"), REGISTRATION);
  assert.doesNotMatch(compiled("<border></border>\n"), /ElementAnimation/u);
});

test("svelte/motion's media query is read from the installed matchMedia, and loads before the DOM exists", () => {
  const patched = patchSvelteRuntime({
    filename: "/app/node_modules/svelte/src/reactivity/media-query.js",
    source: "const q = window.matchMedia(final_query);"
  });
  assert.match(patched, /globalThis[.]matchMedia [?][?] globalThis[.]window[?][.]matchMedia/u);
});
