import { hasStyleTarget, styleTarget } from "./style-targets.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a prop that styles one element names it whatever control holds it", () => {
  assert.equal(styleTarget({
    property: "closeButtonStyle",
    owner: "ContentDialog"
  }), "button");
  assert.equal(styleTarget({
    property: "textBoxStyle",
    owner: "ComboBox"
  }), "text-box");
});

test("a container style names the container of the control that holds it", () => {
  assert.equal(styleTarget({
    property: "itemContainerStyle",
    owner: "ListView"
  }), "list-view-item");
  assert.equal(styleTarget({
    property: "itemContainerStyle",
    owner: "GridView"
  }), "grid-view-item");
  assert.equal(styleTarget({
    property: "itemContainerStyle",
    owner: "TreeView"
  }), "tree-view-item");
});

test("a container style of a control whose container is not known asks for a Style object", () => {
  assert.throws(
    () => styleTarget({
      property: "itemContainerStyle",
      owner: "Pivot"
    }),
    /Pivot\.itemContainerStyle takes a Style object/u
  );
});

test("a prop is known by its name alone or on some control", () => {
  assert.equal(hasStyleTarget("normalPipStyle"), true);
  assert.equal(hasStyleTarget("itemContainerStyle"), true);
  assert.equal(hasStyleTarget("mysteryStyle"), false);
});
