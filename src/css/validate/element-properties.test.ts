import { validateComponent } from "./validate.ts";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();
const FILE = "C:/project/card.svelte";
const IMPORTS = "import { Border, Button, FontIcon, Grid, PathIcon, StackPanel, TextBlock } from \"winui-svelte/components\";";

function check({ markup, style, imports = IMPORTS }: {
  markup: string;
  style: string;
  imports?: string;
}) {
  const source = `<script lang="ts">\n  ${imports}\n</script>\n\n${markup}\n\n<style>\n${style}\n</style>\n`;
  return validateComponent({
    source,
    filename: FILE,
    resources
  }).filter(({ code }) => code === "unsupported-on-element");
}

test("a font size on a path icon is reported at the rule, naming where the class is used", () => {
  const [only, ...others] = check({
    markup: "<PathIcon class=\"icon\" data=\"M0,0\" />",
    style: "  .icon {\n    width: 16px;\n    font-size: 16px;\n  }"
  });
  assert.equal(others.length, 0);
  assert.equal(only?.severity, "error");
  assert.equal(only?.message, "property font-size is not supported on <path-icon> (WinUI's PathIcon has no FontSize) (used by .icon on <path-icon> at card.svelte:5)");
  assert.deepEqual([only?.start.line, only?.start.column], [10, 4]);
});

test("a class shared by elements of different types is checked against each", () => {
  const found = check({
    markup: "<TextBlock class=\"icon\">a</TextBlock>\n<Button class=\"icon\">b</Button>\n<PathIcon class=\"icon\" data=\"M0,0\" />\n<Border class=\"icon\" />",
    style: "  .icon {\n    font-size: 16px;\n  }"
  });
  assert.deepEqual(found.map(({ message }) => message.replace(/ \(WinUI.*\) \(used/u, " (used")), [
    "property font-size is not supported on <path-icon> (used by .icon on <path-icon> at card.svelte:7)",
    "property font-size is not supported on <border> (used by .icon on <border> at card.svelte:8)"
  ]);
});

test("a type selector is checked against its own type", () => {
  const [only] = check({
    markup: "<path-icon></path-icon>",
    style: "  path-icon {\n    font-size: 1px;\n  }"
  });
  assert.match(only?.message ?? "", /^property font-size is not supported on <path-icon> .*used by path-icon on <path-icon> at card\.svelte:5\)$/u);
});

test("a property the control holds through its parents is valid", () => {
  assert.deepEqual(
    check({
      markup: "<TextBlock class=\"text\">a</TextBlock>\n<Button class=\"text\">b</Button>\n<FontIcon class=\"font\" />",
      style: "  .text {\n    font-size: 14px;\n    font-weight: 600;\n    color: red;\n    padding: 2px;\n    opacity: 0.5;\n    margin: 1px;\n  }"
    }), []
  );
});

test("a property of a panel or a border is valid on it", () => {
  assert.deepEqual(
    check({
      markup: "<Border class=\"box\" />\n<Grid class=\"box\" />\n<StackPanel class=\"box\" />",
      style: "  .box {\n    background: red;\n    padding: 4px;\n    border-radius: 4px;\n    width: 10px;\n  }"
    }), []
  );
});

test("a shorthand is named as it was written, once", () => {
  const found = check({
    markup: "<FontIcon class=\"font\" />",
    style: "  .font {\n    padding: 2px;\n  }"
  });
  assert.equal(found.length, 1);
  assert.match(found[0]?.message ?? "", /^property padding is not supported on <font-icon> \(WinUI's FontIcon has no Padding\)/u);
});

test("a color on a border is reported: a border has no foreground", () => {
  const [only] = check({
    markup: "<Border class=\"box\" />",
    style: "  .box {\n    color: red;\n  }"
  });
  assert.match(only?.message ?? "", /^property color is not supported on <border> \(WinUI's Border has no Foreground\)/u);
});

test("what the lowering refuses for a type is reported with the same usage", () => {
  const [only] = check({
    markup: "<Border class=\"box\" />",
    style: "  .box {\n    gap: 4px;\n  }"
  });
  assert.match(only?.message ?? "", /^gap has no WinUI meaning on <border> .*\(used by \.box on <border> at card\.svelte:5\)$/u);
});

test("a state rule and a class directive count", () => {
  const found = check({
    markup: "<PathIcon class:on={isOn} data=\"M0,0\" />",
    style: "  .on:hover {\n    font-size: 1px;\n  }"
  });
  assert.equal(found.length, 1);
  assert.match(found[0]?.message ?? "", /on <path-icon> at card\.svelte:5\)$/u);
});

test("a component imported under another name is still the control", () => {
  const found = check({
    markup: "<Glyph class=\"icon\" data=\"M0,0\" />",
    style: "  .icon {\n    font-size: 1px;\n  }",
    imports: "import { PathIcon as Glyph } from \"winui-svelte/components\";"
  });
  assert.equal(found.length, 1);
});

test("an element the app's own component or a class set by an expression is never guessed", () => {
  assert.deepEqual(
    check({
      markup: "<PathIcon class=\"icon\" data=\"M0,0\" />",
      style: "  .icon {\n    font-size: 1px;\n  }",
      imports: "import PathIcon from \"./PathIcon.svelte\";"
    }), []
  );
  assert.deepEqual(
    check({
      markup: "<PathIcon class={name} data=\"M0,0\" />\n<PathIcon {...rest} />\n<span class=\"icon\"></span>",
      style: "  .icon {\n    font-size: 1px;\n  }"
    }), []
  );
});

test("a rule that no element carries the class of is left to Svelte's unused selector", () => {
  assert.deepEqual(
    check({
      markup: "<PathIcon class=\"other\" data=\"M0,0\" />",
      style: "  .icon {\n    font-size: 1px;\n  }"
    }), []
  );
});
