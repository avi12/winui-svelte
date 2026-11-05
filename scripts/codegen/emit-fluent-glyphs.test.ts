import { FluentGlyph } from "#src/components/fluent-glyph.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The table the WebStorm plugin draws in the completion of a glyph: every
// Fluent icon name with the code point FluentGlyph has

const TABLE_FILE = path.resolve(import.meta.dirname, "../../ide/webstorm/src/main/resources/fluent-glyphs.json");
const HEX_RADIX = 16;
const table = z.object({
  attributes: z.record(z.string(), z.array(z.string())),
  glyphs: z.record(z.string(), z.string())
}).parse(JSON.parse(readFileSync(TABLE_FILE, "utf8")));

test("every Fluent name has its code point in the table, and the table has no other", () => {
  const expected = Object.fromEntries(
    Object.entries(FluentGlyph).map(([name, codePoint]) => [name, codePoint.toString(HEX_RADIX).toUpperCase()])
  );
  assert.deepEqual(table.glyphs, expected);
});

test("the props that take an icon are the ones that are a GlyphInput", () => {
  assert.deepEqual(Object.entries(table.attributes), [["FontIcon", ["glyph"]], ["FontIconSource", ["glyph"]]]);
});

test("Save is U+E74E", () => {
  assert.equal(table.glyphs["Save"], "E74E");
});
