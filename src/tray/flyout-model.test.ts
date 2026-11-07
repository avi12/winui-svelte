import { FlyoutIconKind, flyoutIconOf, trailingTextOf, weightOf } from "./flyout-model.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a path to an image is a file icon, any other text a glyph, and pixels none", () => {
  const file = flyoutIconOf("C:/icons/save.ICO");
  assert.equal(file?.kind, FlyoutIconKind.FILE);
  assert.ok(file?.kind === FlyoutIconKind.FILE && file.uri.startsWith("file:///C:/icons/save"));
  assert.deepEqual(flyoutIconOf("\uE74E"), {
    kind: FlyoutIconKind.GLYPH,
    glyph: "\uE74E"
  });
  assert.equal(flyoutIconOf(undefined), undefined);
  assert.equal(
    flyoutIconOf({
      size: 1,
      bgra: new Uint8Array(4)
    }), undefined
  );
});

test("the trailing text is the badge, then the shortcut", () => {
  assert.equal(trailingTextOf({}), "");
  assert.equal(trailingTextOf({ shortcut: "Ctrl+O" }), "Ctrl+O");
  assert.equal(trailingTextOf({ badge: "3" }), "3");
  assert.equal(
    trailingTextOf({
      badge: "3",
      shortcut: "Ctrl+O"
    }), "3   Ctrl+O"
  );
});

test("a bold line gets the bold weight", () => {
  assert.equal(weightOf({ isBold: true }), "bold");
  assert.equal(weightOf({ isBold: false }), "normal");
});
