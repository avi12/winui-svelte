import {
  BYTES_PER_PIXEL,
  cropOf,
  croppedPixels,
  downscaledPixels,
  fittedSize,
  sourceBox,
  unionOf
} from "./text-geometry.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

function ramp({ width, height }: {
  width: number;
  height: number;
}) {
  const pixels = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (let i = 0; i < width * height; i++) {
    pixels.set([i, i, i, 255], i * BYTES_PER_PIXEL);
  }

  return pixels;
}

function blues(pixels: Uint8Array) {
  return [...pixels].filter((_, index) => index % BYTES_PER_PIXEL === 0);
}

test("no region reads the whole image", () => {
  assert.deepEqual(
    cropOf({
      region: undefined,
      width: 100,
      height: 50
    }), {
      x: 0,
      y: 0,
      width: 100,
      height: 50
    }
  );
});

test("a region widens to the pixels it touches and is clipped to the image", () => {
  assert.deepEqual(
    cropOf({
      region: {
        x: 10.5,
        y: -5,
        width: 20.2,
        height: 30
      },
      width: 100,
      height: 50
    }), {
      x: 10,
      y: 0,
      width: 21,
      height: 25
    }
  );
  assert.deepEqual(
    cropOf({
      region: {
        x: 90,
        y: 40,
        width: 50,
        height: 50
      },
      width: 100,
      height: 50
    }), {
      x: 90,
      y: 40,
      width: 10,
      height: 10
    }
  );
});

test("a region outside the image, or with no area, is no crop", () => {
  const image = {
    width: 100,
    height: 50
  };
  assert.equal(
    cropOf({
      ...image,
      region: {
        x: 100,
        y: 0,
        width: 10,
        height: 10
      }
    }), undefined
  );
  assert.equal(
    cropOf({
      ...image,
      region: {
        x: 5,
        y: 5,
        width: 0,
        height: 10
      }
    }), undefined
  );
});

test("an image within the limit is read as it is; a larger one is scaled to its longer edge", () => {
  assert.deepEqual(
    fittedSize({
      width: 800,
      height: 600,
      limit: 800
    }), {
      width: 800,
      height: 600
    }
  );
  assert.deepEqual(
    fittedSize({
      width: 2000,
      height: 1000,
      limit: 500
    }), {
      width: 500,
      height: 250
    }
  );
  assert.deepEqual(
    fittedSize({
      width: 100,
      height: 10000,
      limit: 1000
    }), {
      width: 10,
      height: 1000
    }
  );
});

test("a crop copies the pixels of the rectangle, row by row", () => {
  const pixels = ramp({
    width: 4,
    height: 3
  });
  const cropped = croppedPixels({
    pixels,
    width: 4,
    crop: {
      x: 1,
      y: 1,
      width: 2,
      height: 2
    }
  });
  assert.deepEqual(blues(cropped), [5, 6, 9, 10]);
});

test("a crop of whole rows is a view of the same bytes", () => {
  const pixels = ramp({
    width: 2,
    height: 3
  });
  const cropped = croppedPixels({
    pixels,
    width: 2,
    crop: {
      x: 0,
      y: 1,
      width: 2,
      height: 2
    }
  });
  assert.equal(cropped.buffer, pixels.buffer);
  assert.deepEqual(blues(cropped), [2, 3, 4, 5]);
});

test("a downscale averages the pixels each new pixel covers", () => {
  const pixels = new Uint8Array([
    0, 0, 0, 255, 100, 100, 100, 255,
    200, 200, 200, 255, 100, 100, 100, 255
  ]);
  const scaled = downscaledPixels({
    pixels,
    source: {
      width: 2,
      height: 2
    },
    target: {
      width: 1,
      height: 1
    }
  });
  assert.deepEqual([...scaled], [100, 100, 100, 255]);
});

test("a box maps back through the downscale and the crop", () => {
  assert.deepEqual(
    sourceBox({
      box: {
        x: 10,
        y: 20,
        width: 30,
        height: 5
      },
      crop: {
        x: 100,
        y: 200,
        width: 400,
        height: 200
      },
      read: {
        width: 200,
        height: 100
      }
    }), {
      x: 120,
      y: 240,
      width: 60,
      height: 10
    }
  );
});

test("an unscaled box only moves by the crop", () => {
  assert.deepEqual(
    sourceBox({
      box: {
        x: 7,
        y: 8,
        width: 9,
        height: 10
      },
      crop: {
        x: 100,
        y: 50,
        width: 300,
        height: 300
      },
      read: {
        width: 300,
        height: 300
      }
    }), {
      x: 107,
      y: 58,
      width: 9,
      height: 10
    }
  );
});

test("the union of boxes holds all of them", () => {
  assert.deepEqual(
    unionOf([
      {
        x: 10,
        y: 10,
        width: 10,
        height: 10
      },
      {
        x: 30,
        y: 5,
        width: 5,
        height: 30
      }
    ]), {
      x: 10,
      y: 5,
      width: 25,
      height: 30
    }
  );
  assert.equal(unionOf([]).width, 0);
});
