import { emitBindings, emitLevel } from "./emit.ts";
import { buildModel } from "./model.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCK_PATH = path.join(import.meta.dirname, "..", "..", ".winapp", "winmds.lock.json");
const HAS_METADATA = existsSync(LOCK_PATH);

// The metadata is the one `pnpm restore` locked, so these need it.
test("the model finds the components, their bindables and attached properties", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  function find(name: string) {
    return model.classes.find(level => level.type.name === name);
  }

  const toggle = find("ToggleSwitch");
  assert.equal(toggle?.isComponent, true);
  assert.equal(toggle?.tag, "toggle-switch");
  assert.deepEqual(toggle?.bindables.map(bindable => bindable.key), ["isOn"]);
  assert.deepEqual(toggle?.bindables[0]?.events, ["Toggled"]);
  assert.equal(find("Border")?.contentProperty, "Child");
  assert.equal(find("Grid")?.contentProperty, "Children");
  assert.equal(find("Control")?.isComponent, false);
  const attached = find("FrameworkElement")?.attached.map(entry => entry.key);
  assert.deepEqual(attached, ["gridRow", "gridColumn", "gridRowSpan", "gridColumnSpan"]);
});

test("a flag-less bindable pair comes from the <Property>Changed rule", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const textBox = model.classes.find(level => level.type.name === "TextBox");
  assert.ok(textBox?.bindables.some(bindable => bindable.key === "text"));
});

test("a TextBox's selection is bindable through its SelectionChanged event", { skip: !HAS_METADATA }, () => {
  const model = buildModel(LOCK_PATH);
  const textBox = model.classes.find(level => level.type.name === "TextBox");
  const keys = textBox?.bindables.map(bindable => bindable.key) ?? [];
  assert.ok(keys.includes("selectionStart") && keys.includes("selectionLength"));
  assert.deepEqual(textBox?.bindables.find(bindable => bindable.key === "selectionStart")?.events, ["SelectionChanged"]);
});

test("generating twice gives the same text", { skip: !HAS_METADATA }, () => {
  const first = buildModel(LOCK_PATH);
  const second = buildModel(LOCK_PATH);
  assert.equal(emitBindings(first), emitBindings(second));
  const level = first.classes.find(entry => entry.type.name === "Button");
  const other = second.classes.find(entry => entry.type.name === "Button");
  assert.ok(level !== undefined && other !== undefined);
  assert.equal(emitLevel(level), emitLevel(other));
});
