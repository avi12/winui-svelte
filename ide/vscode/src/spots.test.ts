import { cssColorOf } from "./css-color.ts";
import { spotsOf } from "./spots.ts";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

const PROJECT = mkdtempSync(path.join(tmpdir(), "winui-spots-"));
writeFileSync(
  path.join(PROJECT, "package.json"), JSON.stringify({
    dependencies: {
      "winui-svelte": "*"
    }
  })
);
writeFileSync(path.join(PROJECT, "Label.svelte"), "<script lang=\"ts\">interface Props { face: FontFamilyInput; icon?: GlyphInput; }</script>");
const FILE = path.join(PROJECT, "A.svelte");

async function found(text: string) {
  return (await spotsOf({
    text,
    file: FILE
  })).map(spot => `${spot.kind}:${text.slice(spot.start, spot.end)}`);
}

test("a style directive and a style attribute give a spot for each color", async () => {
  assert.deepEqual(await found("<Border style:color=\"yellow\" />"), ["color:yellow"]);
  assert.deepEqual(
    await found("<Border style=\"color: red; width: 4px; background-color: #0af\" />"),
    ["color:red", "color:#0af"]
  );
});

test("a color prop is a spot, and so is a half-typed one, so that its names can be completed", async () => {
  assert.deepEqual(await found("<Border background=\"red\" />"), ["color:red"]);
  assert.deepEqual(await found("<Border background=\"notacolor\" />"), ["color:notacolor"]);
});

test("a font family list gives a spot for each family, quotes aside", async () => {
  assert.deepEqual(
    await found("<TextBlock fontFamily=\"'Segoe UI', Arial\" />"),
    ["font:'Segoe UI'", "font:Arial"]
  );
  assert.deepEqual(await found("<Border style=\"font-family: Consolas\" />"), ["font:Consolas"]);
});

test("a wrapper component's props typed GlyphInput and FontFamilyInput are spots", async () => {
  const text = "<script lang=\"ts\">import Label from \"./Label.svelte\";</script><Label face=\"Arial\" icon=\"Save\" other=\"x\" />";
  assert.deepEqual(await found(text), ["font:Arial", "glyph:Save"]);
});

test("each string of an expression is a spot of the prop's kind", async () => {
  assert.deepEqual(
    await found("<FontIcon glyph={isReady ? \"Play\" : 'CheckMark'} />"),
    ["glyph:Play", "glyph:CheckMark"]
  );
  assert.deepEqual(await found("<Border background={isOn ? \"red\" : count} />"), ["color:red"]);
  assert.deepEqual(await found("<Border style:color={isOn ? \"red\" : \"blue\"} />"), ["color:red", "color:blue"]);
  assert.deepEqual(await found("<TextBlock fontFamily={isOn ? \"Arial\" : \"Consolas\"} />"), ["font:Arial", "font:Consolas"]);
  assert.deepEqual(await found("<TextBlock text={isOn ? \"Play\" : \"Save\"} />"), []);
});

test("a wrapper component's GlyphInput and FontFamilyInput props take expressions too", async () => {
  const text = "<script lang=\"ts\">import Label from \"./Label.svelte\";</script><Label face={isOn ? \"Arial\" : \"Consolas\"} icon={isOn ? \"Save\" : \"Play\"} other={isOn ? \"x\" : \"y\"} />";
  assert.deepEqual(await found(text), ["font:Arial", "font:Consolas", "glyph:Save", "glyph:Play"]);
});

test("a project without the dependency has no spots", async () => {
  const other = mkdtempSync(path.join(tmpdir(), "no-winui-"));
  writeFileSync(
    path.join(other, "package.json"), JSON.stringify({
      dependencies: {}
    })
  );
  assert.deepEqual(
    await spotsOf({
      text: "<Border style:color=\"red\" />",
      file: path.join(other, "A.svelte")
    }), []
  );
});

test("a CSS color becomes rrggbb", () => {
  assert.equal(cssColorOf("red"), "#ff0000");
  assert.equal(cssColorOf("#0af"), "#00aaff");
  assert.equal(cssColorOf("nope"), undefined);
});
