import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { build } from "vite";

// A consumer that imports only the tray menu model (winui-svelte/tray/menu)
// gets the model and nothing that draws it: no Svelte runtime, no component,
// no window runtime, no renderer. Bundled the way a consumer's build would,
// against the built package.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const ENTRY = path.join(import.meta.dirname, "treeshake-app", "menu-model-main.ts");
const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));
const BUNDLE_TIMEOUT_MILLISECONDS = 120_000;
const externalModule = new RegExp(String.raw`^#winui/|dist[\/]bindings|@microsoft[\/]dynwinrt`, "u");

// Measured: the whole bundle today (a server-side build leaves zod and Svelte as imports)
// Lower it when the entry gets smaller; never raise it to make a change pass
const BUDGET_BYTES = 5000;
const DRAWING_FOLDERS = ["components", "renderer", "window", "css", "tray/menu-svelte"];
const SVELTE_IMPORT = /from\s*["']svelte/u;

async function bundle() {
  const result = await build({
    configFile: false,
    root: path.dirname(ENTRY),
    logLevel: "warn",
    resolve: {
      alias: exportAliases(ExportTarget.BUILT)
    },
    build: {
      write: false,
      ssr: true,
      minify: true,
      rollupOptions: {
        input: ENTRY,
        external: (id: string) => externalModule.test(id)
      }
    }
  });
  const outputs = Array.isArray(result) ? result : [result];
  const chunks = outputs
    .flatMap(output => "output" in output ? output.output : [])
    .flatMap(item => item.type === "chunk" ? [item] : []);
  return {
    code: chunks.map(chunk => chunk.code).join("\n"),
    sourceFiles: chunks.flatMap(chunk => Object.keys(chunk.modules))
  };
}

test("a consumer of the tray menu model bundles no Svelte and no component", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundle();
  const bytes = Buffer.byteLength(code);
  console.log(`tray menu model: ${bytes} bytes, ${sourceFiles.length} modules`);
  assert.ok(bytes <= BUDGET_BYTES, `${bytes} bytes is over the ${BUDGET_BYTES} budget`);

  const distFolder = path.join(PACKAGE_ROOT, "dist") + path.sep;
  const ownFiles = sourceFiles
    .filter(file => file.startsWith(distFolder))
    .map(file => file.slice(distFolder.length).replaceAll(path.sep, "/"));
  const drawing = ownFiles.filter(file => DRAWING_FOLDERS.some(folder => file.startsWith(`${folder}/`)));
  assert.deepEqual(drawing, [], "something that draws the menu was bundled");

  assert.ok(!SVELTE_IMPORT.test(code), "the bundle imports Svelte");
});
