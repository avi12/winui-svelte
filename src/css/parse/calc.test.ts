import { evaluateCalc } from "./calc.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("calc folds px and rem sums, products and quotients", () => {
  assert.equal(evaluateCalc("calc(10px + 4px)"), 14);
  assert.equal(evaluateCalc("calc(1rem + 2px)"), 18);
  assert.equal(evaluateCalc("calc(100px - 2 * 8px)"), 84);
  assert.equal(evaluateCalc("calc((10px + 6px) / 4)"), 4);
  assert.equal(evaluateCalc("calc(-4px + 10px)"), 6);
  assert.equal(evaluateCalc("calc(10px*2)"), 20);
});

test("calc with a percentage, a variable, mixed dimensions or bad syntax is null", () => {
  for (const token of ["calc(100% - 8px)", "calc(var(--a) + 1px)", "calc(1px + 2)", "calc(2px * 3px)", "calc(1px / 0)", "calc(1px +)", "calc((1px)", "10px"]) {
    assert.equal(evaluateCalc(token), null, token);
  }
});
