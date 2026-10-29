import { focusElement, FocusKind } from "./focus-element.ts";
import { FakeElement } from "#src/renderer/testing/fake-controls.js";
import { FocusState } from "#src/winui.js";
import assert from "node:assert/strict";
import { test } from "node:test";

test("focus arrives as programmatic unless the caller says how", () => {
  const element = new FakeElement();
  assert.equal(
    focusElement({ control: element }),
    true
  );
  focusElement({
    control: element,
    state: FocusKind.keyboard
  });
  focusElement({
    control: element,
    state: FocusKind.pointer
  });
  assert.deepEqual(element.focusCalls, [FocusState.Programmatic, FocusState.Keyboard, FocusState.Pointer]);
});

test("a control that cannot take focus says so", () => {
  const element = new FakeElement();
  element.isFocusable = false;
  assert.equal(
    focusElement({ control: element }),
    false
  );
});
