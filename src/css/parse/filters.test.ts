import { IDENTITY_MATRIX, multiplyMatrices, parseFilterList } from "./filters.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const ROWS = 4;
const COLUMNS = 5;
const TOLERANCE = 1e-9;

// A pixel (red, green, blue, alpha) through a matrix.
function apply({ values, pixel }: {
  values: readonly number[];
  pixel: readonly number[];
}) {
  return Array.from({ length: ROWS }, (_unused, row) => {
    let sum = values[row * COLUMNS + ROWS] ?? 0;
    for (const [iChannel, channel] of pixel.entries()) {
      sum += (values[row * COLUMNS + iChannel] ?? 0) * channel;
    }

    return sum;
  });
}

function valuesOf(text: string) {
  const result = parseFilterList(text);
  assert.ok(result.isValid, text);
  const [step] = result.steps;
  assert.equal(step?.kind, "matrix");
  return step?.kind === "matrix" ? step.values : [];
}

function assertPixel({ actual, expected }: {
  actual: readonly number[];
  expected: readonly number[];
}) {
  for (const [i, value] of expected.entries()) {
    assert.ok(Math.abs((actual[i] ?? Number.NaN) - value) < TOLERANCE, `${actual.join(",")} is not ${expected.join(",")}`);
  }
}

test("none is no step", () => {
  assert.deepEqual(parseFilterList("none"), {
    isValid: true,
    steps: []
  });
});

test("blur takes a length, and 0 when it has no argument", () => {
  assert.deepEqual(parseFilterList("blur(4px)"), {
    isValid: true,
    steps: [{
      kind: "blur",
      radius: 4
    }]
  });
  assert.deepEqual(parseFilterList("blur()"), {
    isValid: true,
    steps: [{
      kind: "blur",
      radius: 0
    }]
  });
  assert.equal(parseFilterList("blur(-1px)").isValid, false);
});

test("grayscale(1) is the luminance, grayscale(0) changes nothing", () => {
  assertPixel({
    actual: apply({
      values: valuesOf("grayscale(1)"),
      pixel: [1, 0, 0, 1]
    }),
    expected: [0.2126, 0.2126, 0.2126, 1]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("grayscale(0)"),
      pixel: [0.3, 0.6, 0.9, 1]
    }),
    expected: [0.3, 0.6, 0.9, 1]
  });
});

test("sepia, saturate, hue-rotate, invert, opacity, brightness and contrast follow the Filter Effects matrices", () => {
  assertPixel({
    actual: apply({
      values: valuesOf("sepia(1)"),
      pixel: [1, 1, 1, 1]
    }),
    expected: [1.351, 1.203, 0.937, 1]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("saturate(0)"),
      pixel: [1, 0, 0, 1]
    }),
    expected: [0.213, 0.213, 0.213, 1]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("hue-rotate(360deg)"),
      pixel: [0.2, 0.4, 0.8, 1]
    }),
    expected: [0.2, 0.4, 0.8, 1]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("invert(100%)"),
      pixel: [0.25, 0.5, 1, 1]
    }),
    expected: [0.75, 0.5, 0, 1]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("opacity(0.5)"),
      pixel: [0.25, 0.5, 1, 1]
    }),
    expected: [0.25, 0.5, 1, 0.5]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("brightness(150%)"),
      pixel: [0.2, 0.4, 0.8, 1]
    }),
    expected: [0.3, 0.6, 1.2, 1]
  });
  assertPixel({
    actual: apply({
      values: valuesOf("contrast(0)"),
      pixel: [0.2, 0.4, 0.8, 1]
    }),
    expected: [0.5, 0.5, 0.5, 1]
  });
});

test("neighbouring colour functions are one matrix, in order", () => {
  const result = parseFilterList("brightness(2) invert(1)");
  assert.ok(result.isValid);
  assert.equal(result.steps.length, 1);
  assertPixel({
    actual: apply({
      values: valuesOf("brightness(2) invert(1)"),
      pixel: [0.25, 0.25, 0.25, 1]
    }),
    expected: [0.5, 0.5, 0.5, 1]
  });
});

test("a blur between colour functions keeps them apart", () => {
  const result = parseFilterList("grayscale(1) blur(2px) sepia(1)");
  assert.ok(result.isValid);
  assert.deepEqual(result.steps.map(step => step.kind), ["matrix", "blur", "matrix"]);
});

test("drop-shadow takes offsets, a blur and a colour in either place", () => {
  const result = parseFilterList("drop-shadow(2px 3px 4px #ff0000)");
  assert.ok(result.isValid);
  assert.deepEqual(result.steps, [{
    kind: "shadow",
    x: 2,
    y: 3,
    radius: 4,
    color: "#FF0000"
  }]);
  const leading = parseFilterList("drop-shadow(red 1px 1px)");
  assert.ok(leading.isValid);
  assert.equal(leading.steps[0]?.kind, "shadow");
});

test("anything else is not a filter", () => {
  assert.equal(parseFilterList("url(#blur)").isValid, false);
  assert.equal(parseFilterList("grayscale(abc)").isValid, false);
  assert.equal(parseFilterList("drop-shadow(1px)").isValid, false);
  assert.equal(parseFilterList("").isValid, false);
});

test("multiplying by the identity keeps a matrix", () => {
  const sepia = valuesOf("sepia(0.5)");
  assertPixel({
    actual: multiplyMatrices({
      first: sepia,
      second: IDENTITY_MATRIX
    }),
    expected: sepia
  });
});
