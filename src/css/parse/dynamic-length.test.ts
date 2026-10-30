import { isDynamicLength, resolveDynamicLength } from "./dynamic-length.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const basis = {
  percent: 400,
  viewport: {
    width: 1000,
    height: 600
  },
  container: {
    width: 300,
    height: 200
  },
  titleBar: {
    x: 8,
    y: 0,
    width: 900,
    height: 32
  }
};

test("a function of lengths with a %, viewport or container unit is dynamic", () => {
  for (const value of ["calc(100% - 8px)", "clamp(10px, 5vw, 40px)", "min(50%, 300px)", "calc(10cqw + 1px)"]) {
    assert.equal(isDynamicLength(value), true, value);
  }

  for (const value of ["calc(1px + 2px)", "50%", "clamp(1px, 2px, 3px)", "100vw"]) {
    assert.equal(isDynamicLength(value), false, value);
  }
});

test("each unit is that percent of its size, folded with the calc fold", () => {
  function resolve(expression: string) {
    return resolveDynamicLength({
      expression,
      basis
    });
  }
  assert.equal(resolve("calc(100% - 8px)"), 392);
  assert.equal(resolve("calc(50% + 10vw)"), 300);
  assert.equal(resolve("clamp(10px, 5vw, 40px)"), 40);
  assert.equal(resolve("min(50%, 150px)"), 150);
  assert.equal(resolve("calc(50cqw + 25cqh)"), 200);
  assert.equal(resolve("max(10vmin, 10vmax)"), 100);
});

test("a unit whose size is unknown makes the length unknown", () => {
  assert.equal(
    resolveDynamicLength({
      expression: "calc(100% - 8px)",
      basis: {
        ...basis,
        percent: null
      }
    }), null
  );
});

test("env(titlebar-area-*) is the custom title bar's rectangle, unknown without one", () => {
  const expression = "calc(100% - env(titlebar-area-width) + env(titlebar-area-x))";
  assert.equal(isDynamicLength(expression), true);
  assert.equal(
    resolveDynamicLength({
      expression,
      basis
    }), -492
  );
  assert.equal(
    resolveDynamicLength({
      expression,
      basis: {
        ...basis,
        titleBar: null
      }
    }), null
  );
});
