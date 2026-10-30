import { evaluateCalc } from "./calc.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("calc folds px sums, products and quotients", () => {
  assert.equal(evaluateCalc("calc(10px + 4px)"), 14);
  assert.equal(evaluateCalc("calc(16px + 2px)"), 18);
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

test("min, max and clamp fold lengths, and nest with calc", () => {
  assert.equal(evaluateCalc("min(10px, 32px)"), 10);
  assert.equal(evaluateCalc("max(10px, 32px, calc(1px + 40px))"), 41);
  assert.equal(evaluateCalc("clamp(10px, 5px, 20px)"), 10);
  assert.equal(evaluateCalc("clamp(10px, 50px, 20px)"), 20);
  assert.equal(evaluateCalc("clamp(10px, calc(8px + 4px), 20px)"), 12);
  assert.equal(evaluateCalc("min(10px, max(2px, 4px))"), 4);
  assert.equal(evaluateCalc("calc(1px + min(2px, 3px))"), 3);
});

test("min, max and clamp with a percentage or the wrong arity are null", () => {
  for (const token of ["min(10px, 50%)", "clamp(1px, 2px)", "max()", "min(1px, 2vw)"]) {
    assert.equal(evaluateCalc(token), null, token);
  }
});
