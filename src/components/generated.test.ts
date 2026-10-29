import { levels } from "./generated/metadata.ts";
import { WINUI_COMPILE_OPTIONS } from "#src/vite/compile.js";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { compile, compileModule } from "svelte/compiler";

// Every generated file goes through Svelte's compiler, with the options
// the window compiles with: a component that does not compile, or compiles with a
// warning, fails here and not when the window loads it.

const GENERATED_FOLDER = path.join(import.meta.dirname, "generated");

function filesIn({ folder, suffix }: {
  folder: string;
  suffix: string;
}) {
  return readdirSync(folder)
    .filter(name => name.endsWith(suffix) && !name.endsWith(".d.svelte.ts"))
    .map(name => path.join(folder, name));
}

test("every component compiles without a warning", () => {
  const files = filesIn({
    folder: GENERATED_FOLDER,
    suffix: ".svelte"
  });
  assert.ok(files.length > 100, `only ${files.length} components`);
  for (const file of files) {
    const result = compile(readFileSync(file, "utf8"), {
      ...WINUI_COMPILE_OPTIONS,
      filename: file,
      runes: true
    });
    const warnings = result.warnings.map(warning => `${path.basename(file)}: ${warning.message}`);
    assert.deepEqual(warnings, []);
  }
});

test("every level's module compiles", () => {
  const files = filesIn({
    folder: path.join(GENERATED_FOLDER, "controls"),
    suffix: ".svelte.ts"
  });
  assert.equal(files.length, Object.keys(levels).length);
  for (const file of files) {
    compileModule(stripTypeScriptTypes(readFileSync(file, "utf8")), {
      filename: file,
      generate: "client"
    });
  }
});

test("each component has a declaration and a level", () => {
  const components = Object.entries(levels).filter(([, level]) => level.isComponent);
  const generatedNames = filesIn({
    folder: GENERATED_FOLDER,
    suffix: ".svelte"
  }).map(file => path.basename(file, ".svelte"));
  assert.deepEqual(generatedNames.sort(), components.map(([name]) => name).sort());
});

test("a hand-written component compiles without a warning", () => {
  const handWrittenFolder = path.join(import.meta.dirname, "hand-written");
  const files = filesIn({
    folder: handWrittenFolder,
    suffix: ".svelte"
  });
  assert.ok(files.length > 0);
  for (const file of files) {
    const result = compile(readFileSync(file, "utf8"), {
      ...WINUI_COMPILE_OPTIONS,
      filename: file,
      runes: true
    });
    const warnings = result.warnings.map(warning => `${path.basename(file)}: ${warning.message}`);
    assert.deepEqual(warnings, []);
  }
});
