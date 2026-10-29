import { emitComponent, emitLevel } from "./emit.ts";
import { buildModel } from "./model.ts";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const LOCK_PATH = path.join(import.meta.dirname, "..", "..", ".winapp", "winmds.lock.json");
const HAS_METADATA = existsSync(LOCK_PATH);

function levelOf(name: string) {
  const level = buildModel(LOCK_PATH).classes.find(entry => entry.type.name === name);
  assert.ok(level !== undefined, `${name} is a class of the model`);
  return level;
}

test("a visual state is made through XAML with the name its prop gives", { skip: !HAS_METADATA }, () => {
  const component = emitComponent(levelOf("VisualState"));
  assert.match(component, /let \{ name, children,/u);
  assert.match(
    component,
    /registerControls\(\{ "visual-state": namedByXaml\(\{ type: VisualState, xamlName: "VisualState", name: untrack\(\(\) => name\) \}\) \}\);/u
  );
  const level = emitLevel(levelOf("VisualState"));
  assert.doesNotMatch(level, /export interface VisualStateProps extends NamedProps/u);
  assert.match(level, /export type VisualStateComponentProps = VisualStateProps & ElementProps & NamedProps;/u);
  assert.doesNotMatch(level, /linkNamedProps/u);
});

test("a setter is made with its target path and the target and path props leave the control's props", { skip: !HAS_METADATA }, () => {
  const component = emitComponent(levelOf("Setter"));
  assert.match(component, /setterAt\(\{ type: Setter, target: untrack\(\(\) => target\), path: untrack\(\(\) => path\) \}\)/u);
  const level = emitLevel(levelOf("Setter"));
  assert.doesNotMatch(level, /property\?: Setter\["property"\]/u);
  assert.doesNotMatch(level, /target\?: Setter\["target"\]/u);
  assert.match(level, /SetterTargetProps/u);
});

test("a group style leaves out the styles WinUI would need a Style object for", { skip: !HAS_METADATA }, () => {
  const level = emitLevel(levelOf("GroupStyle"));
  assert.doesNotMatch(level, /bcontainerStyle?/u);
  assert.doesNotMatch(level, /headerContainerStyle/u);
  assert.match(level, /hidesIfEmpty/u);
});

test("a list's group styles are a collection its snippet fills", { skip: !HAS_METADATA }, () => {
  assert.match(emitComponent(levelOf("ItemsControl")), /<property name="groupStyle">/u);
});
