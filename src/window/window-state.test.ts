import { WindowPresentation } from "./chrome.ts";
import {
  clampedBounds,
  parseWindowState,
  rescaledBounds,
  restoredBounds,
  serializeWindowState,
  WindowRestoreState
} from "./window-state.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const WORK_AREA = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1032
};
const LEFT_MONITOR = {
  x: -1920,
  y: -200,
  width: 1920,
  height: 1032
};
const WINDOW = {
  x: 100,
  y: 80,
  width: 800,
  height: 600
};
const DOUBLE = 2;
const SAVED = {
  bounds: WINDOW,
  scale: 1,
  state: WindowRestoreState.normal,
  presentation: WindowPresentation.windowed
};

test("bounds inside the work area stay as they are", () => {
  assert.deepEqual(
    clampedBounds({
      bounds: WINDOW,
      area: WORK_AREA
    }), WINDOW
  );
});

test("bounds that overlap an edge are moved in whole", () => {
  assert.deepEqual(
    clampedBounds({
      bounds: {
        ...WINDOW,
        x: 1500,
        y: 800
      },
      area: WORK_AREA
    }), {
      x: 1120,
      y: 432,
      width: 800,
      height: 600
    }
  );
  assert.deepEqual(
    clampedBounds({
      bounds: {
        ...WINDOW,
        x: -300,
        y: -50
      },
      area: WORK_AREA
    }), {
      ...WINDOW,
      x: 0,
      y: 0
    }
  );
});

test("bounds on a display that is gone come back to the nearest one", () => {
  const clamped = clampedBounds({
    bounds: {
      ...WINDOW,
      x: 5000,
      y: 3000
    },
    area: WORK_AREA
  });
  assert.deepEqual(clamped, {
    x: 1120,
    y: 432,
    width: 800,
    height: 600
  });
});

test("negative coordinates of a monitor left of the primary one are kept", () => {
  const onLeft = {
    x: -1500,
    y: -100,
    width: 800,
    height: 600
  };
  assert.deepEqual(
    clampedBounds({
      bounds: onLeft,
      area: LEFT_MONITOR
    }), onLeft
  );
});

test("bounds larger than a work area that shrank are shrunk to it", () => {
  assert.deepEqual(
    clampedBounds({
      bounds: {
        x: 0,
        y: 0,
        width: 2560,
        height: 1400
      },
      area: WORK_AREA
    }), WORK_AREA
  );
});

test("a changed scale resizes the window and leaves its place", () => {
  assert.deepEqual(
    rescaledBounds({
      bounds: WINDOW,
      from: 1,
      to: DOUBLE
    }), {
      x: 100,
      y: 80,
      width: 1600,
      height: 1200
    }
  );
  assert.deepEqual(
    rescaledBounds({
      bounds: WINDOW,
      from: DOUBLE,
      to: DOUBLE
    }), WINDOW
  );
});

test("a restored window is rescaled and then clamped", () => {
  assert.deepEqual(
    restoredBounds({
      saved: {
        ...SAVED,
        bounds: {
          ...WINDOW,
          x: 1000
        }
      },
      scale: DOUBLE,
      area: WORK_AREA
    }), {
      x: 320,
      y: 0,
      width: 1600,
      height: 1032
    }
  );
});

test("saved state survives a round trip", () => {
  assert.deepEqual(parseWindowState(serializeWindowState(SAVED)), SAVED);
});

test("a missing, corrupt or old file is no saved state", () => {
  const rejected = [
    undefined,
    "",
    "not json",
    "null",
    "[]",
    JSON.stringify({ bounds: WINDOW }),
    JSON.stringify({
      ...SAVED,
      state: "folded"
    }),
    JSON.stringify({
      ...SAVED,
      scale: 0
    }),
    JSON.stringify({
      ...SAVED,
      bounds: {
        ...WINDOW,
        width: 0
      }
    }),
    JSON.stringify({
      ...SAVED,
      bounds: {
        ...WINDOW,
        x: 1.5
      }
    })
  ];
  for (const text of rejected) {
    assert.equal(parseWindowState(text), null, String(text));
  }
});
