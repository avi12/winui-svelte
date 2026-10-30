import { parseAngle, parseDegrees } from "./angles.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("an angle is degrees, and a bare zero is one", () => {
  assert.equal(parseDegrees("-45deg"), -45);
  assert.equal(parseDegrees("0"), 0);
  assert.equal(parseDegrees("45"), null);
});

test("rad, grad and turn are not angles", () => {
  for (const token of ["0.5turn", "100grad", "1rad"]) {
    assert.equal(parseDegrees(token), null, token);
  }
});

test("an angle in radians", () => {
  assert.equal(parseAngle("180deg"), Math.PI);
  assert.equal(parseAngle("45"), null);
});
