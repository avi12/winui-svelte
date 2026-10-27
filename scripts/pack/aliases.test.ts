import { filesIn } from "#scripts/files-in.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Source imports across folders go through `#src/*` (CLAUDE.md), which only
// exists in the repository: the build must leave dist/ with relative imports.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const DIST_FOLDER = path.join(PACKAGE_ROOT, "dist");
const IS_BUILT = existsSync(DIST_FOLDER);
const SHIPPED_EXTENSIONS = [".js", ".ts", ".svelte"];

test("package.json maps #src/*.js to the TypeScript source", () => {
  const manifest = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  assert.equal(manifest.imports["#src/*.js"], "./src/*.ts");
});

test("dist/ has no #src import left", { skip: !IS_BUILT }, () => {
  const shipped = filesIn(DIST_FOLDER).filter(file => SHIPPED_EXTENSIONS.includes(path.extname(file)));
  const aliased = shipped.filter(file => readFileSync(file, "utf8").includes("#src/"));
  assert.deepEqual(aliased.map(file => path.relative(PACKAGE_ROOT, file)), []);
});

test("an aliased import becomes the relative path to the compiled module", { skip: !IS_BUILT }, () => {
  const declaration = readFileSync(path.join(DIST_FOLDER, "messaging", "messaging.d.ts"), "utf8");
  assert.ok(declaration.includes("\"../state/transports/transport.js\""));
});
