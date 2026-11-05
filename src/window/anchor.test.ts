import {
  anchoredBounds,
  dockedBounds,
  fittedBounds,
  SizeToContent,
  WindowAnchor
} from "./anchor.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const WORK_AREA = {
  x: 0,
  y: 0,
  width: 1920,
  height: 1032
};
const PILL = {
  x: 1410,
  y: 966,
  width: 504,
  height: 60
};
const NO_LIMITS = {
  minWidth: 0,
  minHeight: 0,
  maxWidth: Infinity,
  maxHeight: Infinity
};
const TALLER = 260;
const INSET = 6;

test("a bottom-right window that grows taller grows upward", () => {
  const bounds = anchoredBounds({
    bounds: PILL,
    size: {
      width: PILL.width,
      height: TALLER
    },
    anchor: WindowAnchor.bottomRight
  });
  assert.deepEqual(bounds, {
    x: PILL.x,
    y: PILL.y + PILL.height - TALLER,
    width: PILL.width,
    height: TALLER
  });
  assert.equal(bounds.x + bounds.width, PILL.x + PILL.width, "the right edge stays");
  assert.equal(bounds.y + bounds.height, PILL.y + PILL.height, "the bottom edge stays");
});

test("each anchor keeps its own corner", () => {
  const size = {
    width: 300,
    height: 100
  };
  assert.deepEqual(
    anchoredBounds({
      bounds: PILL,
      size,
      anchor: WindowAnchor.topLeft
    }),
    {
      ...size,
      x: PILL.x,
      y: PILL.y
    }
  );
  assert.deepEqual(
    anchoredBounds({
      bounds: PILL,
      size,
      anchor: WindowAnchor.topRight
    }),
    {
      ...size,
      x: PILL.x + PILL.width - size.width,
      y: PILL.y
    }
  );
  assert.deepEqual(
    anchoredBounds({
      bounds: PILL,
      size,
      anchor: WindowAnchor.bottomLeft
    }),
    {
      ...size,
      x: PILL.x,
      y: PILL.y + PILL.height - size.height
    }
  );
});

test("docking puts the window against the corner, inset in device pixels", () => {
  const size = {
    width: PILL.width,
    height: PILL.height
  };
  assert.deepEqual(
    dockedBounds({
      area: WORK_AREA,
      size,
      anchor: WindowAnchor.bottomRight,
      inset: INSET
    }), {
      ...size,
      x: WORK_AREA.width - size.width - INSET,
      y: WORK_AREA.height - size.height - INSET
    }
  );
  assert.deepEqual(
    dockedBounds({
      area: WORK_AREA,
      size,
      anchor: WindowAnchor.topLeft,
      inset: INSET
    }), {
      ...size,
      x: INSET,
      y: INSET
    }
  );
});

test("docking honors a work area that does not start at the origin", () => {
  const second = {
    x: 1920,
    y: -200,
    width: 2560,
    height: 1400
  };
  const docked = dockedBounds({
    area: second,
    size: {
      width: 100,
      height: 50
    },
    anchor: WindowAnchor.topRight,
    inset: 0
  });
  assert.equal(docked.x, 1920 + 2560 - 100);
  assert.equal(docked.y, -200);
});

test("a fit sizes the named sides and leaves the others", () => {
  const desired = {
    width: 700,
    height: TALLER
  };
  const height = fittedBounds({
    bounds: PILL,
    desired,
    mode: SizeToContent.height,
    anchor: WindowAnchor.bottomRight,
    limits: NO_LIMITS
  });
  assert.equal(height?.width, PILL.width, "height mode keeps the width");
  assert.equal(height?.height, TALLER);
  const width = fittedBounds({
    bounds: PILL,
    desired,
    mode: SizeToContent.width,
    anchor: WindowAnchor.bottomRight,
    limits: NO_LIMITS
  });
  assert.equal(width?.height, PILL.height, "width mode keeps the height");
  assert.equal(width?.x, PILL.x + PILL.width - desired.width);
  const both = fittedBounds({
    bounds: PILL,
    desired,
    mode: SizeToContent.both,
    anchor: WindowAnchor.topLeft,
    limits: NO_LIMITS
  });
  assert.deepEqual(both, {
    x: PILL.x,
    y: PILL.y,
    ...desired
  });
});

test("a fit that changes nothing is null, and none never fits", () => {
  assert.equal(
    fittedBounds({
      bounds: PILL,
      desired: {
        width: PILL.width,
        height: PILL.height
      },
      mode: SizeToContent.both,
      anchor: WindowAnchor.bottomRight,
      limits: NO_LIMITS
    }),
    null
  );
  assert.equal(
    fittedBounds({
      bounds: PILL,
      desired: {
        width: 1,
        height: 1
      },
      mode: SizeToContent.none,
      anchor: WindowAnchor.bottomRight,
      limits: NO_LIMITS
    }),
    null
  );
});

test("a fit stays within the limits", () => {
  const tallest = 200;
  const shortest = 80;
  const limits = {
    minWidth: 0,
    maxWidth: Infinity,
    minHeight: shortest,
    maxHeight: tallest
  };
  const tall = fittedBounds({
    bounds: PILL,
    desired: {
      width: PILL.width,
      height: TALLER
    },
    mode: SizeToContent.height,
    anchor: WindowAnchor.bottomRight,
    limits
  });
  assert.equal(tall?.height, tallest);
  const short = fittedBounds({
    bounds: PILL,
    desired: {
      width: PILL.width,
      height: 10
    },
    mode: SizeToContent.height,
    anchor: WindowAnchor.bottomRight,
    limits
  });
  assert.equal(short?.height, shortest);
});
