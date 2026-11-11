import { SizeUnit, toCssPixels, toDevicePixels, toWindowPixels } from "./css-pixels.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const SCALE_150_PERCENT = 1.5;

test("CSS pixels are device pixels over the scale, and back", () => {
  assert.equal(
    toDevicePixels({
      value: 504,
      scale: SCALE_150_PERCENT
    }), 756
  );
  assert.equal(
    toCssPixels({
      value: 756,
      scale: SCALE_150_PERCENT
    }), 504
  );
});

test("a fraction rounds to the nearest pixel", () => {
  assert.equal(
    toDevicePixels({
      value: 101,
      scale: SCALE_150_PERCENT
    }), 152
  );
  assert.equal(
    toCssPixels({
      value: 101,
      scale: SCALE_150_PERCENT
    }), 67
  );
});

test("a physical window side ignores the scale, a device-independent one follows it", () => {
  assert.equal(
    toWindowPixels({
      value: 540,
      unit: SizeUnit.physical,
      scale: SCALE_150_PERCENT
    }), 540
  );
  assert.equal(
    toWindowPixels({
      value: 540,
      unit: SizeUnit.dip,
      scale: SCALE_150_PERCENT
    }), 810
  );
});
