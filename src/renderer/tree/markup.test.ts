import {
  camelCase,
  gridLength,
  GridUnit,
  isNumeric,
  kebabCase,
  pascalCase,
  thicknessSides
} from "./markup.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a class name is a tag in kebab case, an acronym one word", () => {
  assert.equal(kebabCase("ToggleSwitch"), "toggle-switch");
  assert.equal(kebabCase("WebView2"), "web-view2");
  assert.equal(kebabCase("Border"), "border");
  assert.equal(kebabCase("UIElement"), "ui-element");
  assert.equal(kebabCase("InlineUIContainer"), "inline-ui-container");
});

test("a tag, a class name and a property name meet in one kebab-case key", () => {
  assert.equal(kebabCase("inline-ui-container"), "inline-ui-container");
  assert.equal(kebabCase("horizontalAlignment"), kebabCase("HorizontalAlignment"));
});

test("a WinUI name is a property name in camel case", () => {
  assert.equal(camelCase("IsOn"), "isOn");
  assert.equal(camelCase("XamlRoot"), "xamlRoot");
});

test("kebab-case names read as WinUI's", () => {
  assert.equal(pascalCase("stack-panel"), "StackPanel");
  assert.equal(pascalCase("grid"), "Grid");
  assert.equal(camelCase("vertical-alignment"), "verticalAlignment");
  assert.equal(camelCase("column-span"), "columnSpan");
});

test("a thickness has one, two or four sides, as in XAML", () => {
  assert.deepEqual(thicknessSides("8"), {
    left: 8,
    top: 8,
    right: 8,
    bottom: 8
  });
  assert.deepEqual(thicknessSides("8, 4"), {
    left: 8,
    top: 4,
    right: 8,
    bottom: 4
  });
  assert.deepEqual(thicknessSides("0,12,0,0"), {
    left: 0,
    top: 12,
    right: 0,
    bottom: 0
  });
});

test("a grid length is Auto, a star weight or pixels", () => {
  assert.deepEqual(gridLength("Auto"), {
    unit: GridUnit.AUTO,
    value: 1
  });
  assert.deepEqual(gridLength("*"), {
    unit: GridUnit.STAR,
    value: 1
  });
  assert.deepEqual(gridLength("2.5*"), {
    unit: GridUnit.STAR,
    value: 2.5
  });
  assert.deepEqual(gridLength("48"), {
    unit: GridUnit.PIXEL,
    value: 48
  });
});

test("a number is told from a name", () => {
  assert.ok(isNumeric("12"));
  assert.ok(isNumeric("-0.5"));
  assert.ok(!isNumeric(""));
  assert.ok(!isNumeric(" "));
  assert.ok(!isNumeric("Center"));
});
