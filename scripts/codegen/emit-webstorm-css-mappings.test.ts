import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The table the WebStorm plugin reads, as generate.ts writes it: each entry
// comes from asking the translator, so the cases here are what it answers.

const TABLE_FILE = path.resolve(import.meta.dirname, "../../ide/webstorm/src/main/resources/winui-css-mappings.json");
const tableSchema = z.object({
  attributes: z.record(
    z.string(),
    z.object({
      cssProperty: z.string(),
      kind: z.string(),
      enumTypes: z.array(z.string()),
      keywords: z.record(z.string(), z.string()).optional(),
      reason: z.string().optional()
    })
  )
});
const table = tableSchema.parse(JSON.parse(readFileSync(TABLE_FILE, "utf8"))).attributes;

test("visibility converts Collapsed to hidden and Visible to visible", () => {
  assert.deepEqual(table["visibility"], {
    cssProperty: "visibility",
    kind: "keyword",
    enumTypes: ["Visibility"],
    keywords: Object.fromEntries([
      ["Collapsed", "hidden"],
      ["Visible", "visible"]
    ])
  });
});

test("lengths, colors, thickness and corner radius have a kind of their own", () => {
  assert.equal(table["width"]?.kind, "length");
  assert.equal(table["opacity"]?.kind, "number");
  assert.equal(table["background"]?.kind, "color");
  assert.equal(table["padding"]?.kind, "thickness");
  assert.equal(table["cornerRadius"]?.kind, "cornerRadius");
  assert.equal(table["fontFamily"]?.kind, "text");
});

test("a CSS property that sets other WinUI properties too converts nothing", () => {
  assert.equal(table["lineHeight"]?.kind, "unsupported");
  assert.equal(table["focusVisualPrimaryThickness"]?.kind, "unsupported");
});

test("an unsupported entry says why and a converting one does not", () => {
  for (const entry of Object.values(table)) {
    const isUnsupported = entry.kind === "unsupported";
    assert.equal(entry.reason !== undefined, isUnsupported);
  }
});

test("a prop with no CSS counterpart has no entry", () => {
  assert.equal(table["text"], undefined);
  assert.equal(table["content"], undefined);
});
