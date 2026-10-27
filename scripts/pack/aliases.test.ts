import { filesIn } from "../files-in.ts";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Source imports across folders go through `#src/*` (CLAUDE.md), which only
// exists in the repository: the build must leave dist/ with relative imports.

const packageRoot = path.join(import.meta.dirname, "..", "..");
const distFolder = path.join(packageRoot, "dist");
const isBuilt = existsSync(distFolder);
const shippedExtensions = [".js", ".ts", ".svelte"];

test("package.json maps #src/*.js to the TypeScript source", () => {
  const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
  assert.equal(manifest.imports["#src/*.js"], "./src/*.ts");
});

test("dist/ has no #src import left", { skip: !isBuilt }, () => {
  const shipped = filesIn(distFolder).filter(file => shippedExtensions.includes(path.extname(file)));
  const aliased = shipped.filter(file => readFileSync(file, "utf8").includes("#src/"));
  assert.deepEqual(aliased.map(file => path.relative(packageRoot, file)), []);
});

test("an aliased import becomes the relative path to the compiled module", { skip: !isBuilt }, () => {
  const declaration = readFileSync(path.join(distFolder, "messaging", "messaging.d.ts"), "utf8");
  assert.ok(declaration.includes("\"../state/transports/transport.js\""));
});
