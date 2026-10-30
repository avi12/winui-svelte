import { patchedRuntimeFiles, patchSvelteRuntime } from "#src/vite/runtime-patch.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

// Every edit of the runtime patch finds its anchor in the Svelte under test:
// the installed one, or the matrix's copy (WINUI_SVELTE_SVELTE_ROOT).

const SVELTE_FOLDER = path.dirname(fileURLToPath(import.meta.resolve("svelte/package.json")));

for (const file of patchedRuntimeFiles()) {
  test(`the patch of ${file} applies`, () => {
    const filename = path.join(SVELTE_FOLDER, "src", file);
    const source = readFileSync(filename, "utf8");
    assert.doesNotThrow(() => patchSvelteRuntime({
      filename,
      source
    }));
  });
}
