import { displayAtBounds } from "./display-at-bounds.ts";
import type { DisplayAreaInfo } from "./displays.svelte.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const PRIMARY_ID = 1n;
const LEFT_ID = 2n;
const ABOVE_ID = 3n;

function areaOf({ id, x, y, width, height }: {
  id: bigint;
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  const bounds = {
    x,
    y,
    width,
    height
  };
  return {
    id,
    isPrimary: id === PRIMARY_ID,
    outerBounds: bounds,
    workArea: bounds
  } satisfies DisplayAreaInfo;
}

// A 4K primary, a 1440p display left of it and higher than its top, and a
// 1080p display above it: two negative origins and three sizes in pixels
const AREAS = [
  areaOf({
    id: PRIMARY_ID,
    x: 0,
    y: 0,
    width: 3840,
    height: 2160
  }),
  areaOf({
    id: LEFT_ID,
    x: -2560,
    y: -200,
    width: 2560,
    height: 1440
  }),
  areaOf({
    id: ABOVE_ID,
    x: 100,
    y: -1080,
    width: 1920,
    height: 1080
  })
];

test("a rectangle equal to a display's bounds finds it, left of the primary too", () => {
  assert.equal(
    displayAtBounds({
      x: -2560,
      y: -200,
      width: 2560,
      height: 1440,
      areas: AREAS
    })?.id,
    LEFT_ID
  );
});

test("the order of the list does not matter", () => {
  assert.equal(
    displayAtBounds({
      x: 100,
      y: -1080,
      width: 1920,
      height: 1080,
      areas: [...AREAS].reverse()
    })?.id,
    ABOVE_ID
  );
});

test("a window moved a little finds the display that holds its centre", () => {
  assert.equal(
    displayAtBounds({
      x: -2000,
      y: 0,
      width: 800,
      height: 600,
      areas: AREAS
    })?.id,
    LEFT_ID
  );
});

test("a window half over two displays belongs to the one with its centre", () => {
  assert.equal(
    displayAtBounds({
      x: -100,
      y: 100,
      width: 400,
      height: 300,
      areas: AREAS
    })?.id,
    PRIMARY_ID
  );
});

test("no display has those bounds or that centre", () => {
  assert.equal(
    displayAtBounds({
      x: 5000,
      y: 5000,
      width: 100,
      height: 100,
      areas: AREAS
    }),
    undefined
  );
  assert.equal(
    displayAtBounds({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      areas: []
    }),
    undefined
  );
});
