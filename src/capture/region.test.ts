import {
  capturePlan,
  isSameRectangle,
  overlapOf,
  sizeWithin,
  wholeOf
} from "./region.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const MONITOR = {
  width: 3840,
  height: 2160
};

describe("isSameRectangle", () => {
  const rectangle = {
    x: 1,
    y: 2,
    width: 3,
    height: 4
  };

  it("is true for equal rectangles and for two nulls", () => {
    assert.equal(
      isSameRectangle({
        first: rectangle,
        second: {
          ...rectangle
        }
      }), true
    );
    assert.equal(
      isSameRectangle({
        first: null,
        second: null
      }), true
    );
  });

  it("is false when any side differs, or only one is null", () => {
    assert.equal(
      isSameRectangle({
        first: rectangle,
        second: {
          ...rectangle,
          height: 5
        }
      }), false
    );
    assert.equal(
      isSameRectangle({
        first: rectangle,
        second: null
      }), false
    );
  });
});

describe("sizeWithin", () => {
  it("keeps a picture that already fits", () => {
    assert.deepEqual(
      sizeWithin({
        size: MONITOR,
        maxEdge: 4000
      }), MONITOR
    );
  });

  it("keeps the size when there is no limit", () => {
    assert.deepEqual(sizeWithin({ size: MONITOR }), MONITOR);
  });

  it("shrinks the longest edge to the limit and keeps the proportions", () => {
    assert.deepEqual(
      sizeWithin({
        size: MONITOR,
        maxEdge: 1280
      }), {
        width: 1280,
        height: 720
      }
    );
  });

  it("shrinks a tall picture by its height", () => {
    assert.deepEqual(
      sizeWithin({
        size: {
          width: 500,
          height: 1000
        },
        maxEdge: 100
      }), {
        width: 50,
        height: 100
      }
    );
  });

  it("never makes a side less than one pixel", () => {
    assert.deepEqual(
      sizeWithin({
        size: {
          width: 10_000,
          height: 2
        },
        maxEdge: 100
      }), {
        width: 100,
        height: 1
      }
    );
  });
});

describe("overlapOf", () => {
  it("is the shared part", () => {
    assert.deepEqual(
      overlapOf({
        first: wholeOf(MONITOR),
        second: {
          x: -100,
          y: 50,
          width: 300,
          height: 300
        }
      }), {
        x: 0,
        y: 50,
        width: 200,
        height: 300
      }
    );
  });

  it("is nothing when the rectangles only touch", () => {
    assert.equal(
      overlapOf({
        first: {
          x: 0,
          y: 0,
          width: 10,
          height: 10
        },
        second: {
          x: 10,
          y: 0,
          width: 10,
          height: 10
        }
      }), undefined
    );
  });
});

describe("capturePlan", () => {
  it("maps the whole monitor onto the whole output", () => {
    const output = {
      width: 240,
      height: 135
    };
    const plan = capturePlan({
      monitor: MONITOR,
      region: wholeOf(MONITOR),
      output
    });
    assert.deepEqual(plan.source, wholeOf(MONITOR));
    assert.deepEqual(plan.destination, wholeOf(output));
  });

  it("maps a region inside the monitor onto the whole output", () => {
    const output = {
      width: 400,
      height: 300
    };
    const plan = capturePlan({
      monitor: MONITOR,
      region: {
        x: 120,
        y: 80,
        width: 800,
        height: 600
      },
      output
    });
    assert.deepEqual(plan.source, {
      x: 120,
      y: 80,
      width: 800,
      height: 600
    });
    assert.deepEqual(plan.destination, wholeOf(output));
  });

  it("leaves the part of the output past the monitor's edge blank, not stretched", () => {
    const plan = capturePlan({
      monitor: MONITOR,
      region: {
        x: -100,
        y: -50,
        width: 400,
        height: 200
      },
      output: {
        width: 200,
        height: 100
      }
    });
    assert.deepEqual(plan.source, {
      x: 0,
      y: 0,
      width: 300,
      height: 150
    });
    assert.deepEqual(plan.destination, {
      x: 50,
      y: 25,
      width: 150,
      height: 75
    });
  });

  it("has nothing to draw for a region wholly off the monitor", () => {
    const plan = capturePlan({
      monitor: MONITOR,
      region: {
        x: 4000,
        y: 0,
        width: 100,
        height: 100
      },
      output: {
        width: 100,
        height: 100
      }
    });
    assert.deepEqual(plan, {
      source: undefined,
      destination: undefined
    });
  });
});
