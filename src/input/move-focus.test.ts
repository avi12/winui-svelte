import { moveFocus } from "./move-focus.ts";
import { FocusNavigationDirection } from "#winui/microsoft/ui/xaml/input/FocusNavigationDirection";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import assert from "node:assert/strict";
import { test } from "node:test";

// WinUI refuses the tab-order directions in a desktop app; moveFocus says so
// before it calls FocusManager. The moves that work are in test/focus.test.ts.

test("Next and Previous throw instead of reaching WinUI", () => {
  const fake = {};
  const within = fake as UIElement;
  for (const direction of [FocusNavigationDirection.Next, FocusNavigationDirection.Previous]) {
    assert.throws(() => moveFocus({
      direction,
      within
    }), /Up, Down, Left or Right/u);
  }
});
