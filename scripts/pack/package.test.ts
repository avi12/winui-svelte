import { jsonSchema } from "#src/messaging/json.js";
import type { Json } from "#src/messaging/json.js";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// package.json's exports and bin are what a consumer resolves, so they point at
// what `pnpm build` makes (dist), never at the TypeScript sources.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");

const exportsSchema = z.record(z.string(), jsonSchema);

const manifestSchema = z.object({
  exports: exportsSchema,
  bin: z.record(z.string(), z.string()),
  files: z.array(z.string()),
  sideEffects: z.literal(false),
  license: z.literal("MIT")
});

function targetsOf(entry: Json) {
  const targets: string[] = [];
  const pending: Json[] = [entry];
  for (const current of pending) {
    if (typeof current === "string") {
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

test("no export or bin points at a TypeScript source", () => {
  const targets = [
    ...Object.values(manifest.exports).flatMap(targetsOf),
    ...Object.values(manifest.bin)
  ].filter(target => target !== "./package.json");
  for (const target of targets) {
    assert.ok(target.startsWith("./dist/"), `${target} is not in dist`);
    assert.ok(!target.endsWith(".ts") || target.endsWith(".d.ts"), `${target} is a source file`);
  }
});

test("every export has types, and a default that is JavaScript", () => {
  for (const [name, entry] of Object.entries(manifest.exports)) {
    if (name === "./package.json") {
      continue;
    }

    const conditions = exportsSchema.parse(entry);
    assert.ok(typeof conditions["types"] === "string", `${name} has no types`);
    assert.ok(String(conditions["default"]).endsWith(".js"), `${name} has no JavaScript default`);
  }
});

test("every export and the bin is a file of dist once it is built", { skip: !IS_BUILT }, () => {
  const targets = [
    ...Object.values(manifest.exports).flatMap(targetsOf),
    ...Object.values(manifest.bin)
  ];
  for (const target of targets) {
    assert.ok(existsSync(path.join(PACKAGE_ROOT, target)), `${target} is missing: pnpm build did not make it`);
  }
});

test("the published files never include the contributor notes", () => {
  assert.ok(!manifest.files.includes("CLAUDE.md"));
  assert.ok(manifest.files.includes("LICENSE"));
});
