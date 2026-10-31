import { extraPackages } from "#scripts/codegen/tables.ts";
import { filesIn } from "#scripts/files-in.ts";
import { jsonSchema } from "#src/messaging/json.js";
import type { Json } from "#src/messaging/json.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// package.json's exports and the `#winui` bindings are what a consumer
// resolves, so they point at what `pnpm build` makes (dist), never at the
// TypeScript sources.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");

const exportsSchema = z.record(z.string(), jsonSchema);

const manifestSchema = z.object({
  exports: exportsSchema,
  imports: z.object({
    "#winui/*": z.object({
      types: z.string(),
      default: z.string()
    })
  }),
  files: z.array(z.string()),
  sideEffects: z.literal(false),
  license: z.literal("Apache-2.0"),
  os: z.tuple([z.literal("win32")]),
  cpu: z.tuple([z.literal("x64"), z.literal("arm64")])
});

function targetsOf(entry: Json) {
  const targets: string[] = [];
  const pending: Json[] = [entry];
  for (const current of pending) {
    const isTarget = typeof current === "string";
    if (isTarget) {
      targets.push(current);
      continue;
    }

    const nested = exportsSchema.safeParse(current);
    if (nested.success) {
      pending.push(...Object.values(nested.data));
    }
  }

  return targets;
}

const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")));
const IS_BUILT = existsSync(path.join(PACKAGE_ROOT, "dist"));

test("no export points at a TypeScript source", () => {
  const targets = Object.values(manifest.exports).flatMap(targetsOf).filter(target => target !== "./package.json");
  for (const target of targets) {
    assert.ok(target.startsWith("./dist/"), `${target} is not in dist`);
    assert.ok(!target.endsWith(".ts") || target.endsWith(".d.ts"), `${target} is a source file`);
  }
});

test("every export has types, and a default that is JavaScript", () => {
  for (const [name, entry] of Object.entries(manifest.exports)) {
    const isPackageJson = name === "./package.json";
    if (isPackageJson) {
      continue;
    }

    const isDataFile = typeof entry === "string" && entry.endsWith(".json");
    if (isDataFile) {
      continue;
    }

    const conditions = exportsSchema.parse(entry);
    assert.ok(typeof conditions["types"] === "string", `${name} has no types`);
    assert.ok(String(conditions["default"]).endsWith(".js"), `${name} has no JavaScript default`);
  }
});

test("every export is a file of dist once it is built", { skip: !IS_BUILT }, () => {
  for (const target of Object.values(manifest.exports).flatMap(targetsOf)) {
    const isPattern = target.includes("*");
    const shipped = isPattern ? target.slice(0, target.indexOf("*")) : target;
    assert.ok(existsSync(path.join(PACKAGE_ROOT, shipped)), `${target} is missing: pnpm build did not make it`);
  }
});

test("any bound class is importable as winui-svelte/bindings/<namespace>/<Class>", { skip: !IS_BUILT }, () => {
  const entry = exportsSchema.parse(manifest.exports["./bindings/*"]);
  const subpath = "windows/security/credentials/PasswordCredential";
  for (const condition of ["types", "default"]) {
    const target = String(entry[condition]).replace("*", subpath);
    assert.ok(existsSync(path.join(PACKAGE_ROOT, target)), `${target} is missing`);
  }
});

test("the bindings and the Windows App SDK bootstrapper ship in dist", { skip: !IS_BUILT }, () => {
  const bindings = manifest.imports["#winui/*"];
  for (const target of Object.values(bindings)) {
    assert.ok(target.startsWith("./dist/bindings/"), `${target} is not in dist/bindings`);
  }

  const bootstrapper = path.join(PACKAGE_ROOT, "dist", "bin", process.arch, "Microsoft.WindowsAppRuntime.Bootstrap.dll");
  assert.ok(existsSync(bootstrapper), `${bootstrapper} is missing: pnpm build did not copy it`);
});

test("the extra packages' native libraries ship wherever they were restored", { skip: !IS_BUILT }, () => {
  const restoredFolder = path.join(PACKAGE_ROOT, ".winapp", "bin", process.arch);
  const libraries = extraPackages.flatMap(extra => extra.libraries);
  for (const library of libraries) {
    const isRestored = existsSync(path.join(restoredFolder, library));
    if (isRestored) {
      const shipped = path.join(PACKAGE_ROOT, "dist", "bin", process.arch, library);
      assert.ok(existsSync(shipped), `${shipped} is missing: pnpm build did not copy it`);
    }
  }
});

test("the published files never include the contributor notes", () => {
  assert.ok(!manifest.files.includes("CLAUDE.md"));
  assert.ok(manifest.files.includes("LICENSE"));
  assert.ok(manifest.files.includes("NOTICE"));
});

const sourceMapSchema = z.object({ sources: z.array(z.string()) });
const SHIPPED_SOURCE_MAPS = [".js.map", ".d.ts.map"];
const withheldSource = /\.test\.ts$|[/\\]test-support[/\\]|fake-controls\.ts$|tree-probe\.ts$/u;

test("every source map points at TypeScript the package ships", { skip: !IS_BUILT }, () => {
  const maps = filesIn(path.join(PACKAGE_ROOT, "dist")).filter(file => SHIPPED_SOURCE_MAPS.some(suffix => file.endsWith(suffix)));
  assert.ok(maps.length > 0, "pnpm build made no source maps");
  for (const map of maps) {
    const { sources } = sourceMapSchema.parse(JSON.parse(readFileSync(map, "utf8")));
    for (const source of sources) {
      const resolved = path.resolve(path.dirname(map), source);
      assert.ok(existsSync(resolved), `${map} points at ${source}, which does not exist`);
      assert.ok(!withheldSource.test(resolved), `${map} points at ${source}, which the package does not ship`);
    }
  }
});

test("the README and API.md between them name every exports subpath", () => {
  const manifest = manifestSchema.parse(JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8")));
  const readme = ["README.md", "API.md"].map(file => readFileSync(path.join(PACKAGE_ROOT, file), "utf8")).join("\n");
  const subpaths = Object.keys(manifest.exports).filter(key => key !== "." && key !== "./package.json");
  const unlisted = subpaths.filter(key => {
    const name = key.slice(2);
    const isNamedInFull = readme.includes(`winui-svelte/${name}`);
    const isNamedShort = readme.includes(`\`/${name}\``) || readme.includes(`\`/${name.split("/").at(-1)}\``);
    return !isNamedInFull && !isNamedShort;
  });
  assert.deepEqual(unlisted, []);
});

test("the package installs only where WinUI 3 runs: Windows on x64 or arm64", () => {
  assert.deepEqual(manifest.os, ["win32"]);
  assert.deepEqual(manifest.cpu, ["x64", "arm64"]);
});
