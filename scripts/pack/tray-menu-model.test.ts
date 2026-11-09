import {
  assertWithinBudget,
  BUNDLE_TIMEOUT_MILLISECONDS,
  bundleEntry,
  IS_BUILT,
  ownFilesOf,
  TrayBudget
} from "./bundle-support.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

// A consumer that imports only the tray menu model (winui-svelte/tray/menu)
// gets the model and nothing that draws it: no Svelte runtime, no component,
// no window runtime, no renderer. Bundled the way a consumer's build would,
// against the built package.

const ENTRY = path.join(import.meta.dirname, "treeshake-app", "menu-model-main.ts");
const DRAWING_FOLDERS = ["components", "renderer", "window", "css", "tray/menu-svelte"];
const SVELTE_IMPORT = /from\s*["']svelte/u;

test("a consumer of the tray menu model bundles no Svelte and no component", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundleEntry(ENTRY);
  const bytes = Buffer.byteLength(code);
  console.log(`tray menu model: ${bytes} bytes, ${sourceFiles.length} modules`);
  assertWithinBudget({
    bytes,
    budget: TrayBudget.menuModel
  });

  const ownFiles = ownFilesOf(sourceFiles);
  const drawing = ownFiles.filter(file => DRAWING_FOLDERS.some(folder => file.startsWith(`${folder}/`)));
  assert.deepEqual(drawing, [], "something that draws the menu was bundled");

  assert.ok(!SVELTE_IMPORT.test(code), "the bundle imports Svelte");
});
