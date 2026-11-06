import { referenceAt } from "./resource-reference.ts";
import { resourceOfProperty, winuiResources } from "./resource-table.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const STYLE = ".card { background: var(--card-background-fill-color-default); color: var(--my-own) }";

test("an offset inside the name of a var() finds the whole name", () => {
  const start = STYLE.indexOf("--card");
  const reference = referenceAt({
    text: STYLE,
    offset: start + "--card".length
  });
  assert.equal(reference?.property, "--card-background-fill-color-default");
  assert.equal(reference?.start, start);
  assert.equal(STYLE.slice(reference?.start, reference?.end), "--card-background-fill-color-default");
});

test("the end of a half-typed name is still inside it", () => {
  const text = "a { color: var(--card-b";
  const reference = referenceAt({
    text,
    offset: text.length
  });
  assert.equal(reference?.property, "--card-b");
});

test("an offset outside every var() finds nothing", () => {
  assert.equal(
    referenceAt({
      text: STYLE,
      offset: STYLE.indexOf("background")
    }), undefined
  );
  assert.equal(
    referenceAt({
      text: STYLE,
      offset: STYLE.indexOf(")") + 1
    }), undefined
  );
});

test("a WinUI resource is found by its custom property, an app's own is not", () => {
  const card = resourceOfProperty("--card-background-fill-color-default");
  assert.equal(card?.name, "CardBackgroundFillColorDefault");
  assert.equal(card?.light, "#ffffffb3");
  assert.equal(resourceOfProperty("--my-own"), undefined);
  assert.equal(winuiResources().length > 0, true);
});
