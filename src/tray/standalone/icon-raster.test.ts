import {
  dimmedRaster,
  DISABLED_ALPHA,
  premultipliedSquare,
  rasterOf,
  stripWidthOf,
  tickedRow,
  tintedRaster
} from "./icon-raster.ts";
import { pictureOf } from "#src/tray/menu/icon.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const HALF_ALPHA = 128;
const SIZE = 2;

function squareOf(pixel: readonly number[]) {
  return rasterOf({
    size: SIZE,
    bgra: Uint8Array.from({ length: SIZE * SIZE * 4 }, (_, i) => pixel[i % 4] ?? 0)
  });
}

test("a half transparent pixel comes out premultiplied", () => {
  const out = premultipliedSquare({
    raster: squareOf([200, 100, 50, HALF_ALPHA]),
    size: SIZE
  });
  assert.deepEqual([...out.subarray(0, 4)], [100, 50, 25, HALF_ALPHA]);
});

test("a larger picture is averaged down and a smaller one is centered", () => {
  const down = premultipliedSquare({
    raster: squareOf([10, 20, 30, 255]),
    size: 1
  });
  assert.deepEqual([...down], [10, 20, 30, 255]);

  const wide = premultipliedSquare({
    raster: {
      width: 4,
      height: 2,
      bgra: new Uint8Array(4 * 2 * 4).fill(255)
    },
    size: 4
  });
  assert.equal(wide[3], 0, "the top row of a letterboxed picture is empty");
  assert.equal(wide[(1 * 4 + 1) * 4 + 3], 255, "the picture is in the middle");
});

test("a tinted glyph keeps its alpha and takes the color", () => {
  const tinted = tintedRaster({
    raster: squareOf([1, 2, 3, HALF_ALPHA]),
    rgb: 0xFFEEDD
  });
  assert.deepEqual([...tinted.bgra.subarray(0, 4)], [0xDD, 0xEE, 0xFF, HALF_ALPHA]);
});

test("a disabled picture is grey and fainter", () => {
  const dimmed = dimmedRaster(squareOf([0, 0, 255, 200]));
  const [blue, green, red, alpha] = dimmed.bgra;
  assert.equal(blue, green);
  assert.equal(green, red);
  assert.equal(alpha, Math.round(200 * DISABLED_ALPHA));
});

test("the picture of an icon follows the theme", () => {
  const pair = {
    forLightMenu: "light.png",
    forDarkMenu: "dark.png"
  };
  assert.deepEqual(
    pictureOf({
      icon: pair,
      isDark: true
    }), {
      source: "dark.png",
      isTinted: false
    }
  );
  assert.equal(
    pictureOf({
      icon: pair,
      isDark: false
    }).source, "light.png"
  );
  assert.deepEqual(
    pictureOf({
      icon: {
        tinted: "glyph.png"
      },
      isDark: true
    }), {
      source: "glyph.png",
      isTinted: true
    }
  );
  assert.deepEqual(
    pictureOf({
      icon: "a.ico",
      isDark: true
    }), {
      source: "a.ico",
      isTinted: false
    }
  );
});

function alphaAt({ row, x, y, width }: {
  readonly row: Uint8Array;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}) {
  return row[(y * width + x) * 4 + 3];
}

test("a ticked row has the dot in its strip, the picture after it, and no dot when not ticked", () => {
  const size = 16;
  const strip = stripWidthOf(size);
  const picture = new Uint8Array(size * size * 4).fill(7);
  const options = {
    bytes: picture,
    size,
    rgb: 0xFFFFFF,
    alpha: 1
  };
  const ticked = tickedRow({
    ...options,
    isTicked: true
  });
  const plain = tickedRow({
    ...options,
    isTicked: false
  });
  const width = strip + size;

  assert.equal(ticked.length, width * size * 4);
  assert.equal(
    alphaAt({
      row: ticked,
      x: strip / 2,
      y: size / 2,
      width
    }), 255
  );
  assert.equal(
    alphaAt({
      row: plain,
      x: strip / 2,
      y: size / 2,
      width
    }), 0
  );
  assert.equal(
    alphaAt({
      row: ticked,
      x: strip + 3,
      y: 3,
      width
    }), 7
  );
  assert.equal(
    alphaAt({
      row: plain,
      x: strip + 3,
      y: 3,
      width
    }), 7
  );
});
