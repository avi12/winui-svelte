import {
  assertWithinBudget,
  BUNDLE_TIMEOUT_MILLISECONDS,
  bundleEntry,
  IS_BUILT,
  ownFilesOf
} from "./bundle-support.ts";
import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";

// `winui-svelte/security` alone: the DPAPI calls over the Win32 seam, no
// component, no window runtime and no WinRT binding.

const ENTRY = path.join(import.meta.dirname, "treeshake-app", "security-main.ts");
const HEAVY_FOLDERS = ["components", "renderer", "window", "css"];
const SECURITY_BUDGET_BYTES = 3200;

test("the security entry bundles no component, no window runtime and no WinRT binding", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundleEntry(ENTRY);
  const bytes = Buffer.byteLength(code);
  console.log(`security: ${bytes} bytes, ${sourceFiles.length} modules`);
  assertWithinBudget({
    bytes,
    budget: SECURITY_BUDGET_BYTES
  });

  const heavy = ownFilesOf(sourceFiles).filter(file => HEAVY_FOLDERS.includes(file.split("/")[0] ?? ""));
  assert.deepEqual(heavy, []);
  assert.doesNotMatch(code, /dist[/]bindings|#winui/u);
});
