import { windowsScreenPicker } from "#src/web-apis/eye-dropper.js";
import { createScreenPixelReader } from "#src/web-apis/native.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The real GDI reader and the real picker's construction. Nothing here clicks
// or presses a key: the picker is built but never asked to wait.

test("a screen pixel reads as three channels, or nothing when it is off every screen", () => {
  const readPixel = createScreenPixelReader();
  const pixel = readPixel({
    x: 0,
    y: 0
  });
  const channels = pixel === undefined ? [] : [pixel.red, pixel.green, pixel.blue];
  const isChannels = channels.every(channel => channel >= 0 && channel <= 255);
  assert.equal(isChannels, true);
  assert.equal(
    readPixel({
      x: -100_000,
      y: -100_000
    }), undefined
  );
});

test("the real picker can be built", () => {
  assert.equal(typeof windowsScreenPicker().pick, "function");
});
