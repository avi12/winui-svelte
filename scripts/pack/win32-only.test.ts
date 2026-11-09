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

// What an app ships when it imports only the Win32 seam: the binder and the
// memory helpers, and nothing of the components or the window runtime.

const ENTRY = path.join(import.meta.dirname, "treeshake-app", "win32-main.ts");
const WINDOW_RUNTIME_FOLDERS = ["components", "renderer", "window", "css", "app", "tray"];
const WIN32_ONLY_BUDGET = 1800;

test("importing winui-svelte/win32 alone bundles no component and no window runtime", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const { code, sourceFiles } = await bundleEntry(ENTRY);
  const bytes = Buffer.byteLength(code);
  console.log(`win32-only: ${bytes} bytes, ${sourceFiles.length} modules`);
  assertWithinBudget({
    bytes,
    budget: WIN32_ONLY_BUDGET
  });
  const ownFiles = ownFilesOf(sourceFiles);
  const heavy = ownFiles.filter(file => {
    const isPackageIdentity = file === "window/package-identity.js";
    return !isPackageIdentity && WINDOW_RUNTIME_FOLDERS.includes(file.split("/")[0] ?? "");
  });
  assert.deepEqual(heavy, [], "the window runtime or the components were bundled");
  assert.equal(code.includes("NavigationView"), false);
});
