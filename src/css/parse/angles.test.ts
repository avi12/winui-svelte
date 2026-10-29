import { parseAngle, parseDegrees } from "./angles.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("an angle in degrees is read in every unit, and a bare zero is one", () => {
  assert.equal(parseDegrees("-45deg"), -45);
  assert.equal(parseDegrees("0.5turn"), 180);
  assert.equal(parseDegrees("100grad"), 90);
  assert.equal(parseDegrees("0"), 0);
  assert.equal(parseDegrees("45"), null);
});

test("an angle in radians", () => {
  assert.equal(parseAngle("0.5turn"), Math.PI);
  assert.equal(parseAngle("45"), null);
});
