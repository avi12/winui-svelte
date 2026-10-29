import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";

// Every value (function, class, constant) a hand-written entry point exports is documented in API.md or
// src/css/API.md. The generated components are documented as a family, and
// the entry points that only re-export them are skipped.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const DOCUMENTED_AS_FAMILY = new Set(["./components"]);
const DOCS = ["API.md", "src/css/API.md", "src/state/README.md", "README.md"].map(file => readFileSync(path.join(PACKAGE_ROOT, file), "utf8")).join("\n");

function exportedNames(entry: string) {
  const program = ts.createProgram([entry], { allowJs: false, skipLibCheck: true, noEmit: true });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(entry);
  const symbol = source === undefined ? undefined : checker.getSymbolAtLocation(source);
  return symbol === undefined ? [] : checker.getExportsOfModule(symbol).filter(exported => {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    return (target.flags & ts.SymbolFlags.Value) !== 0;
  }).map(exported => exported.getName());
}

test("API.md documents every public export of the hand-written entry points", () => {
  const manifest: { exports: Record<string, { types?: string }> } = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, "package.json"), "utf8"));
  const missing: string[] = [];
  for (const [subpath, target] of Object.entries(manifest.exports)) {
    const isChecked = target.types !== undefined && !DOCUMENTED_AS_FAMILY.has(subpath);
    if (!isChecked) {
      continue;
    }

    for (const name of exportedNames(path.join(PACKAGE_ROOT, target.types))) {
      const isGenerated = name !== "default" && /^[A-Z]/u.test(name) && subpath === ".";
      const isDocumented = new RegExp(String.raw`\b${name}\b`, "u").test(DOCS);
      if (!isDocumented && !isGenerated) {
        missing.push(`${subpath}: ${name}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});
