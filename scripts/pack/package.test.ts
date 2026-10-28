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
  license: z.literal("MIT")
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

    const conditions = exportsSchema.parse(entry);
    assert.ok(typeof conditions["types"] === "string", `${name} has no types`);
    assert.ok(String(conditions["default"]).endsWith(".js"), `${name} has no JavaScript default`);
  }
});

test("every export is a file of dist once it is built", { skip: !IS_BUILT }, () => {
  for (const target of Object.values(manifest.exports).flatMap(targetsOf)) {
    assert.ok(existsSync(path.join(PACKAGE_ROOT, target)), `${target} is missing: pnpm build did not make it`);
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

test("the WebView2 libraries ship wherever they were restored", { skip: !IS_BUILT }, () => {
  const restoredFolder = path.join(PACKAGE_ROOT, ".winapp", "bin", process.arch);
  for (const library of ["WebView2Loader.dll", "Microsoft.Web.WebView2.Core.dll"]) {
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
