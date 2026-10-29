import { resolveModernColor, resolveModernColors } from "./modern-colors.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function channels(color: string | null) {
  const digits = (color ?? "").slice(1);
  return [0, 2, 4].map(start => parseInt(digits.slice(start, start + 2), 16));
}

function assertClose({ actual, expected }: {
  actual: number[];
  expected: number[];
}) {
  for (const [index, value] of actual.entries()) {
    assert.ok(Math.abs(value - (expected[index] ?? 0)) <= 2, `${actual} vs ${expected}`);
  }
}

test("oklch, oklab, lab and lch resolve to sRGB", () => {
  assertClose({
    actual: channels(resolveModernColor("oklch(62.8% 0.2577 29.23)")),
    expected: [255, 0, 0]
  });
  assertClose({
    actual: channels(resolveModernColor("oklab(1 0 0)")),
    expected: [255, 255, 255]
  });
  assertClose({
    actual: channels(resolveModernColor("oklab(0 0 0)")),
    expected: [0, 0, 0]
  });
  assertClose({
    actual: channels(resolveModernColor("lab(54.29 80.8 69.89)")),
    expected: [255, 0, 0]
  });
  assertClose({
    actual: channels(resolveModernColor("lch(54.29 106.84 40.85)")),
    expected: [255, 0, 0]
  });
});

test("hwb mixes the hue with white and black", () => {
  assert.equal(resolveModernColor("hwb(0 0% 0%)"), "#FF0000");
  assert.equal(resolveModernColor("hwb(120 50% 50%)"), "#808080");
});

test("color-mix in srgb weighs two colors, and keeps the alpha", () => {
  assert.equal(resolveModernColor("color-mix(in srgb, #ff0000, #0000ff)"), "#800080");
  assert.equal(resolveModernColor("color-mix(in srgb, #ff0000 25%, #0000ff)"), "#4000BF");
  assert.match(resolveModernColor("color-mix(in srgb, red 30%, transparent)") ?? "", /^#4D/u);
});

test("an alpha after a slash is kept", () => {
  assert.match(resolveModernColor("oklab(1 0 0 / 50%)") ?? "", /^#80FFFFFF$/u);
});

test("a color the functions cannot read is null, and a plain color passes through", () => {
  assert.equal(resolveModernColor("color-mix(in oklch, red, blue)"), null);
  assert.equal(resolveModernColor("oklch(1 2)"), null);
  assert.equal(resolveModernColor("#0af"), "#00AAFF");
});

test("a value with modern colors inside keeps the rest", () => {
  assert.equal(resolveModernColors("1px solid hwb(0 0% 0%)"), "1px solid #FF0000");
  assert.equal(resolveModernColors("oklab(1 0 0) oklab(0 0 0)"), "#FFFFFF #000000");
  assert.equal(resolveModernColors("rgb(1 2 3)"), "rgb(1 2 3)");
});
