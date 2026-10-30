import { replaceSafeAreaInsets } from "./environment-variables.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("safe-area insets are zero, in a calc too, with or without a fallback", () => {
  assert.equal(replaceSafeAreaInsets("env(safe-area-inset-top)"), "0px");
  assert.equal(replaceSafeAreaInsets("calc(8px + env(safe-area-inset-left, 4px))"), "calc(8px + 0px)");
  assert.equal(replaceSafeAreaInsets("env(titlebar-area-height)"), "env(titlebar-area-height)");
});
