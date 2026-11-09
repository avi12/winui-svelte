import {
  assertWithinBudget,
  BUNDLE_TIMEOUT_MILLISECONDS,
  IS_BUILT,
  PACKAGE_ROOT,
  TrayBudget
} from "./bundle-support.ts";
import { exportAliases, ExportTarget } from "#scripts/export-aliases.ts";
import { buildTray } from "#src/vite/entrypoints/build-tray.js";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// What the build of a tray entrypoint ships: tray.js is the tray-only process
// (the icon, its menu, the single-instance claim), minified the way a release
// is, with no component, no window runtime and no Svelte. Built from the
// example's entrypoints/tray.ts against the built package, so its size is
// what an app's tray costs on disk.

const EXAMPLE_ROOT = path.join(PACKAGE_ROOT, "examples", "tray-entrypoint");
const TRAY_FILE = path.join(EXAMPLE_ROOT, "entrypoints", "tray.ts");

const FORBIDDEN_PATTERNS = [/(?<![-\w])svelte\//u, /NavigationView|ComboBox|ScrollViewer|ContentDialog/u];

test("the tray entrypoint builds to a small tray.js, a manifest and the icon", {
  skip: !IS_BUILT,
  timeout: BUNDLE_TIMEOUT_MILLISECONDS
}, async () => {
  const outDirectory = mkdtempSync(path.join(tmpdir(), "tray-entrypoint-"));
  const files = await buildTray({
    root: EXAMPLE_ROOT,
    file: TRAY_FILE,
    outDirectory,
    isFirst: true,
    isMinified: true,
    config: {
      resolve: {
        alias: exportAliases(ExportTarget.BUILT)
      }
    }
  });
  assert.deepEqual(files, ["tray.js", "tray.json", "tray.ico"]);
  assert.deepEqual(JSON.parse(readFileSync(path.join(outDirectory, "tray.json"), "utf8")), {
    icon: "tray.ico",
    tooltip: "Tray entrypoint example",
    guid: "7d1c5a52-3f1b-4a63-9f5e-2f4d6b0c8a11"
  });
  assert.ok(existsSync(path.join(outDirectory, "tray.ico")));

  const bytes = statSync(path.join(outDirectory, "tray.js")).size;
  console.log(`tray.js: ${bytes} bytes`);
  assertWithinBudget({
    bytes,
    budget: TrayBudget.entrypoint
  });
  const code = readFileSync(path.join(outDirectory, "tray.js"), "utf8");
  assert.deepEqual(FORBIDDEN_PATTERNS.filter(pattern => pattern.test(code)), [], "the window runtime or a component is in tray.js");
  rmSync(outDirectory, {
    recursive: true,
    force: true
  });
});
