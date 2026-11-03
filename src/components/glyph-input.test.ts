import type { GlyphInput } from "./convert.ts";
import { FluentGlyph } from "./fluent-glyph.ts";
import { glyphText } from "./values.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a glyph number must be the code point of a Fluent icon", () => {
  const named: GlyphInput = "Save";
  const coded: GlyphInput = FluentGlyph.Save;
  const composed: GlyphInput = [FluentGlyph.Save, FluentGlyph.Accept];
  // @ts-expect-error 0x1 is the code point of no Segoe Fluent icon
  const unknownCode: GlyphInput = 0x1;
  // @ts-expect-error a list composes Fluent code points only
  const unknownComposed: GlyphInput = [FluentGlyph.Save, 0x1];
  assert.equal(glyphText(named), glyphText(coded));
  assert.equal(glyphText(composed).length, 2);
  assert.ok(unknownCode !== unknownComposed);
});
