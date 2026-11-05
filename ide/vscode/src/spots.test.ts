import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { cssColorOf } from "./css-color.ts";
import { spotsOf } from "./spots.ts";

const project = mkdtempSync(path.join(tmpdir(), "winui-spots-"));
writeFileSync(path.join(project, "package.json"), JSON.stringify({ dependencies: { "winui-svelte": "*" } }));
writeFileSync(path.join(project, "Label.svelte"), "<script lang=\"ts\">interface Props { face: FontFamilyInput; icon?: GlyphInput; }</script>");
const file = path.join(project, "A.svelte");

async function found(text: string) {
  return (await spotsOf({
    text,
    file
  })).map(spot => `${spot.kind}:${text.slice(spot.start, spot.end)}`);
}

test("a style directive and a style attribute give a spot for each color", async () => {
  assert.deepEqual(await found("<Border style:color=\"yellow\" />"), ["color:yellow"]);
  assert.deepEqual(
    await found("<Border style=\"color: red; width: 4px; background-color: #0af\" />"),
    ["color:red", "color:#0af"]
  );
});

test("a color prop is a spot, an unknown color is not", async () => {
  assert.deepEqual(await found("<Border background=\"red\" />"), ["color:red"]);
  assert.deepEqual(await found("<Border background=\"notacolor\" />"), []);
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

test("a project without the dependency has no spots", async () => {
  const other = mkdtempSync(path.join(tmpdir(), "no-winui-"));
  writeFileSync(path.join(other, "package.json"), JSON.stringify({ dependencies: {} }));
  assert.deepEqual(await spotsOf({
    text: "<Border style:color=\"red\" />",
    file: path.join(other, "A.svelte")
  }), []);
});

test("a CSS color becomes rrggbb", () => {
  assert.equal(cssColorOf("red"), "#ff0000");
  assert.equal(cssColorOf("#0af"), "#00aaff");
  assert.equal(cssColorOf("nope"), undefined);
});
