import { capturePlan, fitWithin, overlapOf, wholeOf } from "./region.ts";
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const SURFACE = {
  width: 3840,
  height: 2160
};

describe("fitWithin", () => {
  it("keeps a picture that already fits", () => {
    assert.deepEqual(
      fitWithin({
        size: SURFACE,
        limits: {
          width: 4000,
          height: 4000
        }
      }), SURFACE
    );
  });

  it("keeps the size when there are no limits", () => {
    assert.deepEqual(
      fitWithin({
        size: SURFACE,
        limits: {}
      }), SURFACE
    );
  });

  it("shrinks to the tighter limit and keeps the proportions", () => {
    assert.deepEqual(
      fitWithin({
        size: SURFACE,
        limits: {
          width: 1280,
          height: 1000
        }
      }), {
        width: 1280,
        height: 720
      }
    );
    assert.deepEqual(
      fitWithin({
        size: SURFACE,
        limits: {
          width: 3000,
          height: 540
        }
      }), {
        width: 960,
        height: 540
      }
    );
  });

  it("limits one side alone", () => {
    assert.deepEqual(
      fitWithin({
        size: {
          width: 500,
          height: 1000
        },
        limits: {
          height: 100
        }
      }), {
        width: 50,
        height: 100
      }
    );
  });

  it("never makes a side less than one pixel", () => {
    assert.deepEqual(
      fitWithin({
        size: {
          width: 10_000,
          height: 2
        },
        limits: {
          width: 100
        }
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
        first: wholeOf(SURFACE),
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
  it("maps the whole surface onto the whole output", () => {
    const output = {
      width: 240,
      height: 135
    };
    const plan = capturePlan({
      surface: SURFACE,
      region: wholeOf(SURFACE),
      output
    });
    assert.deepEqual(plan.source, wholeOf(SURFACE));
    assert.deepEqual(plan.destination, wholeOf(output));
  });

  it("maps a region inside the surface onto the whole output", () => {
    const output = {
      width: 400,
      height: 300
    };
    const region = {
      x: 120,
      y: 80,
      width: 800,
      height: 600
    };
    const plan = capturePlan({
      surface: SURFACE,
      region,
      output
    });
    assert.deepEqual(plan.source, region);
    assert.deepEqual(plan.destination, wholeOf(output));
  });

  it("leaves the part of the output past the surface's edge blank, not stretched", () => {
    const plan = capturePlan({
      surface: SURFACE,
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

  it("has nothing to draw for a region wholly off the surface", () => {
    const plan = capturePlan({
      surface: SURFACE,
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
