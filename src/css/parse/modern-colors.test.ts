import { resolveModernColor, resolveModernColors } from "./modern-colors.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function color(token: string) {
  return resolveModernColor({ token });
}

function channels(token: string) {
  const digits = (color(token) ?? "").slice(1);
  const offset = digits.length > 6 ? 2 : 0;
  return [0, 2, 4].map(start => Number.parseInt(digits.slice(offset + start, offset + start + 2), 16));
}

function assertClose({ token, expected }: {
  token: string;
  expected: number[];
}) {
  const actual = channels(token);
  for (const [index, value] of actual.entries()) {
    assert.ok(Math.abs(value - (expected[index] ?? 0)) <= 2, `${token}: ${actual} vs ${expected}`);
  }
}

test("oklch, oklab, lab and lch resolve to sRGB", () => {
  assertClose({
    token: "oklch(0.628 0.2577 29.23)",
    expected: [255, 0, 0]
  });
  assertClose({
    token: "oklab(1 0 0)",
    expected: [255, 255, 255]
  });
  assertClose({
    token: "oklab(0 0 0)",
    expected: [0, 0, 0]
  });
  assertClose({
    token: "lab(54.29 80.8 69.89)",
    expected: [255, 0, 0]
  });
  assertClose({
    token: "lch(54.29 106.84 40.85)",
    expected: [255, 0, 0]
  });
});

test("hwb mixes the hue with white and black", () => {
  assert.equal(color("hwb(0 0% 0%)"), "#FF0000");
  assert.equal(color("hwb(120 50% 50%)"), "#808080");
});

test("color-mix in srgb weighs two colors, and keeps the alpha", () => {
  assert.equal(color("color-mix(in srgb, #ff0000, #0000ff)"), "#800080");
  assert.equal(color("color-mix(in srgb, #ff0000 25%, #0000ff)"), "#4000BF");
  assert.match(color("color-mix(in srgb, red 30%, transparent)") ?? "", /^#4D/u);
});

test("color-mix works in every space and returns the end colors at the ends", () => {
  for (const space of ["srgb-linear", "xyz", "xyz-d50", "lab", "lch", "oklab", "oklch", "hsl", "hwb"]) {
    assertClose({
      token: `color-mix(in ${space}, #ff0000 100%, #0000ff 0%)`,
      expected: [255, 0, 0]
    });
    assertClose({
      token: `color-mix(in ${space}, #ff0000 0%, #0000ff 100%)`,
      expected: [0, 0, 255]
    });
  }
});

test("color-mix in a perceptual space differs from srgb, and in linear light is lighter", () => {
  assert.notEqual(color("color-mix(in oklab, #ff0000, #0000ff)"), color("color-mix(in srgb, #ff0000, #0000ff)"));
  assertClose({
    token: "color-mix(in srgb-linear, #000000, #ffffff)",
    expected: [188, 188, 188]
  });
});

test("hue interpolation takes the shorter way by default, and the longer one on request", () => {
  assertClose({
    token: "color-mix(in hsl, hsl(350 100% 50%), hsl(10 100% 50%))",
    expected: [255, 0, 0]
  });
  assertClose({
    token: "color-mix(in hsl longer hue, hsl(350 100% 50%), hsl(10 100% 50%))",
    expected: [0, 255, 255]
  });
});

test("a relative color keeps the origin's channels it does not change", () => {
  assert.equal(color("rgb(from #ff0000 r g b / 0.5)"), "#80FF0000");
  assert.equal(color("rgb(from #102030 calc(r + 16) g b)"), "#202030");
  assertClose({
    token: "oklch(from #ff0000 l c h)",
    expected: [255, 0, 0]
  });
  assertClose({
    token: "hsl(from #ff0000 calc(h + 120) s l)",
    expected: [0, 255, 0]
  });
});

test("a relative color's origin may be a custom property of the sheet", () => {
  const lookup = new Map([["--c", "#102030"]]);
  assert.equal(
    resolveModernColor({
      token: "rgb(from var(--c) r g b / 0.5)",
      lookup
    }), "#80102030"
  );
  assert.equal(
    resolveModernColor({
      token: "rgb(from var(--missing) r g b)",
      lookup
    }), null
  );
});

test("an alpha after a slash is kept", () => {
  assert.match(color("oklab(1 0 0 / 0.5)") ?? "", /^#80FFFFFF$/u);
});

test("a color the functions cannot read is null, and a plain color passes through", () => {
  assert.equal(color("color-mix(in nowhere, red, blue)"), null);
  assert.equal(color("oklch(1 2)"), null);
  assert.equal(color("#0af"), "#00AAFF");
});

test("a value with modern colors inside keeps the rest", () => {
  assert.equal(resolveModernColors({ value: "1px solid hwb(0 0% 0%)" }), "1px solid #FF0000");
  assert.equal(resolveModernColors({ value: "oklab(1 0 0) oklab(0 0 0)" }), "#FFFFFF #000000");
  assert.equal(resolveModernColors({ value: "rgb(1 2 3)" }), "rgb(1 2 3)");
  assert.equal(resolveModernColors({ value: "rgb(from #ff0000 r g b / 0.5) blue" }), "#80FF0000 blue");
});
