import { composite, contrastRatio, parseRgba, rgbaOfBrush } from "./contrast.ts";
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const WHITE_ON_BLACK = 21;
const PRECISION = 0.01;

function color(css: string) {
  const parsed = parseRgba(css);
  assert.ok(parsed !== null);
  return parsed;
}

describe("contrastRatio", () => {
  test("black on white is 21 and a colour on itself is 1", () => {
    assert.ok(
      Math.abs(
        contrastRatio({
          foreground: color("#000"),
          background: color("#fff")
        }) - WHITE_ON_BLACK
      ) < PRECISION
    );
    assert.equal(
      contrastRatio({
        foreground: color("#336699"),
        background: color("#336699")
      }), 1
    );
  });

  test("grey 767676 on white is the lightest grey that passes AA", () => {
    const ratio = contrastRatio({
      foreground: color("#767676"),
      background: color("white")
    });
    assert.ok(ratio >= 4.5 && ratio < 4.6);
  });
});

describe("parseRgba", () => {
  test("reads hex with and without alpha, and names", () => {
    assert.deepEqual(parseRgba("#ff000080"), {
      alpha: 128,
      red: 255,
      green: 0,
      blue: 0
    });
    assert.deepEqual(parseRgba("lime"), {
      alpha: 255,
      red: 0,
      green: 255,
      blue: 0
    });
    assert.equal(parseRgba("not a colour"), null);
  });
});

describe("rgbaOfBrush", () => {
  test("a solid brush gives its colour and anything else gives null", () => {
    assert.deepEqual(
      rgbaOfBrush({
        color: {
          a: 255,
          r: 1,
          g: 2,
          b: 3
        }
      }), {
        alpha: 255,
        red: 1,
        green: 2,
        blue: 3
      }
    );
    assert.equal(rgbaOfBrush({}), null);
    assert.equal(rgbaOfBrush(null), null);
  });
});

describe("composite", () => {
  test("half-opaque black over white is mid grey, and the result is opaque", () => {
    const result = composite({
      top: color("rgba(0, 0, 0, 0.5)"),
      bottom: color("white")
    });
    assert.equal(result.alpha, 255);
    assert.ok(Math.abs(result.red - 127.5) < 1.5);
  });
});
