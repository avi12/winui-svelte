import assert from "node:assert/strict";
import { test } from "node:test";
import { declaresAsInputType, importedComponents, scanAttributes } from "./markup-scan.ts";
import { codePointOf, isGlyphAttribute, labelOf } from "./glyph-table.ts";

test("a quoted attribute value is found with its position and its tag", () => {
  const text = "<FontIcon glyph=\"Save\" />";
  const [found] = scanAttributes(text);
  assert.equal(found?.tag, "FontIcon");
  assert.equal(found?.attribute, "glyph");
  assert.equal(found?.value, "Save");
  assert.equal(text.slice(found?.valueStart, found?.valueEnd), "Save");
});

test("an expression with an arrow and braces does not end the tag early", () => {
  const found = scanAttributes("<Card onclick={() => { go(\">\"); }} glyph=\"View\">text</Card>");
  assert.deepEqual(found.map(value => `${value.attribute}=${value.value}`), ["glyph=View"]);
});

test("the contents of script and style are not read as tags", () => {
  const text = "<script lang=\"ts\">const a = \"<B glyph='x' />\";</script><style>.a { }</style><B glyph=\"y\" />";
  assert.deepEqual(scanAttributes(text).map(value => `${value.tag}:${value.value}`), ["script:ts", "B:y"]);
});

test("an empty value is found, so the completion can offer names in it", () => {
  const [found] = scanAttributes("<FontIcon glyph=\"\" />");
  assert.equal(found?.value, "");
  assert.equal(found?.valueStart, found?.valueEnd);
});

test("a prop declared as GlyphInput is told from one declared as string", () => {
  assert.equal(declaresAsInputType({
    source: "interface Props { glyph?: GlyphInput; }",
    prop: "glyph",
    inputType: "GlyphInput"
  }), true);
  assert.equal(declaresAsInputType({
    source: "interface Props { glyph: string; }",
    prop: "glyph",
    inputType: "GlyphInput"
  }), false);
});

test("the imported svelte components are named by their import", () => {
  const imported = importedComponents("import FeatureCard from \"./cards/FeatureCard.svelte\";");
  assert.equal(imported.get("FeatureCard"), "./cards/FeatureCard.svelte");
});

test("Save is U+E74E, by name or by character, and FontIcon takes it in glyph", () => {
  assert.equal(codePointOf("Save"), 0xE74E);
  assert.equal(codePointOf(""), 0xE74E);
  assert.equal(codePointOf("Nope"), undefined);
  assert.equal(labelOf(0xE74E), "U+E74E");
  assert.equal(isGlyphAttribute({
    tag: "FontIcon",
    attribute: "glyph"
  }), true);
  assert.equal(isGlyphAttribute({
    tag: "TextBlock",
    attribute: "glyph"
  }), false);
});
