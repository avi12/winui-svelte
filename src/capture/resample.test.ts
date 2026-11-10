import { shrinkPixels } from "./resample.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const CHANNELS = 4;

function solid({ width, height, color }: {
  width: number;
  height: number;
  color: readonly number[];
}) {
  const pixels = new Uint8Array(width * height * CHANNELS);
  for (let iPixel = 0; iPixel < width * height; iPixel++) {
    pixels.set(color, iPixel * CHANNELS);
  }

  return pixels;
}

describe("shrinkPixels", () => {
  it("keeps a solid color a solid color, at the new size", () => {
    const color = [10, 200, 30, 255];
    const shrunk = shrinkPixels({
      pixels: solid({
        width: 7,
        height: 5,
        color
      }),
      size: {
        width: 7,
        height: 5
      },
      target: {
        width: 3,
        height: 2
      }
    });
    assert.equal(shrunk.length, 3 * 2 * CHANNELS);
    for (let iPixel = 0; iPixel < 6; iPixel++) {
      assert.deepEqual([...shrunk.subarray(iPixel * CHANNELS, (iPixel + 1) * CHANNELS)], color);
    }
  });

  it("averages the pixels each output pixel covers", () => {
    // Two pixels in a row, black then white, shrunk to one: the middle gray.
    const pixels = Uint8Array.from([0, 0, 0, 255, 255, 255, 255, 255]);
    const shrunk = shrinkPixels({
      pixels,
      size: {
        width: 2,
        height: 1
      },
      target: {
        width: 1,
        height: 1
      }
    });
    assert.deepEqual([...shrunk], [128, 128, 128, 255]);
  });

  it("weighs a source pixel by how much of it an output pixel covers", () => {
    // Three source pixels (0, 90, 180) to two: the first output covers 1.5 of them.
    const pixels = Uint8Array.from([0, 0, 0, 255, 90, 90, 90, 255, 180, 180, 180, 255]);
    const shrunk = shrinkPixels({
      pixels,
      size: {
        width: 3,
        height: 1
      },
      target: {
        width: 2,
        height: 1
      }
    });
    assert.deepEqual([...shrunk.subarray(0, CHANNELS)], [30, 30, 30, 255]);
    assert.deepEqual([...shrunk.subarray(CHANNELS)], [150, 150, 150, 255]);
  });

  it("refuses pixels that do not fill the size", () => {
    assert.throws(() => shrinkPixels({
      pixels: new Uint8Array(8),
      size: {
        width: 3,
        height: 1
      },
      target: {
        width: 1,
        height: 1
      }
    }), RangeError);
  });
});
