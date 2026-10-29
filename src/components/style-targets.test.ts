import { hasStyleTarget, styleTarget } from "./style-targets.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a prop that styles one element names it whatever control holds it", () => {
  const dialogButton = styleTarget({
    property: "closeButtonStyle",
    owner: "ContentDialog"
  });
  const comboBoxInput = styleTarget({
    property: "textBoxStyle",
    owner: "ComboBox"
  });
  assert.equal(dialogButton, "button");
  assert.equal(comboBoxInput, "text-box");
});

test("a container style names the container of the control that holds it", () => {
  const targets = ["ListView", "GridView", "TreeView"].map(owner => styleTarget({
    property: "itemContainerStyle",
    owner
  }));
  assert.deepEqual(targets, ["list-view-item", "grid-view-item", "tree-view-item"]);
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
