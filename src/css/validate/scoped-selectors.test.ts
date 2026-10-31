import { validateComponent } from "./validate.ts";
import { resolveRelationalSelectors } from "#src/css/relational/relational.js";
import { unusedSelectorMessages } from "#src/css/runtime/sheet-module.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();
const FILE = "C:/project/card.svelte";
const CASES = [
  {
    selector: ".page .title",
    isUsed: true
  },
  {
    selector: ".page > .title",
    isUsed: true
  },
  {
    selector: ".page > .deep",
    isUsed: false
  },
  {
    selector: ".page .deep",
    isUsed: true
  },
  {
    selector: ".first + .second",
    isUsed: true
  },
  {
    selector: ".second + .first",
    isUsed: false
  },
  {
    selector: ".first ~ .second",
    isUsed: true
  },
  {
    selector: ".second ~ .first",
    isUsed: false
  },
  {
    selector: ".page .nothing",
    isUsed: false
  },
  {
    selector: ".nothing .title",
    isUsed: false
  }
] as const;

function component(selector: string) {
  return [
    "<script>import { StackPanel, TextBlock } from \"winui-svelte/components\";</script>",
    "<StackPanel class=\"page\">",
    "  <TextBlock class=\"first title\" />",
    "  <TextBlock class=\"second\" />",
    "  <StackPanel><TextBlock class=\"deep\" /></StackPanel>",
    "</StackPanel>",
    `<style>\n${selector} {\n  opacity: 0.5;\n}\n</style>`,
    ""
  ].join("\n");
}

function warnings(selector: string) {
  return validateComponent({
    source: component(selector),
    filename: FILE,
    resources
  }).filter(diagnostic => diagnostic.severity === "warning").map(diagnostic => diagnostic.message);
}

for (const { selector, isUsed } of CASES) {
  test(`${selector} between component instances is ${isUsed ? "used" : "reported unused with its own text"}`, () => {
    const expected = isUsed ? [] : [`Unused CSS selector "${selector}"\nhttps://svelte.dev/e/css_unused_selector`];
    assert.deepEqual(warnings(selector), expected);
  });

  test(`${selector}: the resolver and Svelte's own matcher agree`, () => {
    const isSvelteUnused = unusedSelectorMessages({
      source: component(selector),
      filename: FILE
    }).length > 0;
    const resolved = resolveRelationalSelectors({
      source: component(selector),
      file: FILE
    }).source;
    const isGiven = /class="[^"]*wsc-1/u.test(resolved);
    assert.equal(isGiven, !isSvelteUnused);
    assert.equal(isGiven, isUsed);
  });
}
