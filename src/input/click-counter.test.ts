import { createClickCounter } from "./click-counter.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const MILLISECONDS = 500;
const DISTANCE = 4;
const TRIPLE_CLICK = 3;
const RIGHT_BUTTON = 2;
const HERE = {
  x: 100,
  y: 100
};

function counter() {
  return createClickCounter({
    milliseconds: MILLISECONDS,
    distance: DISTANCE
  });
}

test("a lone press counts one", () => {
  assert.equal(
    counter().press({
      point: HERE,
      time: 0
    }), 1
  );
});

test("quick presses in the same place count up", () => {
  const clicks = counter();
  assert.equal(
    clicks.press({
      point: HERE,
      time: 0
    }), 1
  );
  assert.equal(
    clicks.press({
      point: HERE,
      time: 200
    }), 2
  );
  assert.equal(
    clicks.press({
      point: HERE,
      time: 400
    }), TRIPLE_CLICK
  );
});

test("a press after the time starts over, and one at exactly the time continues", () => {
  const late = counter();
  late.press({
    point: HERE,
    time: 0
  });
  assert.equal(
    late.press({
      point: HERE,
      time: MILLISECONDS + 1
    }), 1
  );

  const exact = counter();
  exact.press({
    point: HERE,
    time: 0
  });
  assert.equal(
    exact.press({
      point: HERE,
      time: MILLISECONDS
    }), 2
  );
});

test("a press too far away starts over, and one within the distance continues", () => {
  const far = counter();
  far.press({
    point: HERE,
    time: 0
  });
  assert.equal(
    far.press({
      point: {
        x: HERE.x + DISTANCE + 1,
        y: HERE.y
      },
      time: 100
    }), 1
  );

  const near = counter();
  near.press({
    point: HERE,
    time: 0
  });
  assert.equal(
    near.press({
      point: {
        x: HERE.x + DISTANCE,
        y: HERE.y
      },
      time: 100
    }), 2
  );
});

test("a different button starts over", () => {
  const clicks = counter();
  clicks.press({
    point: HERE,
    time: 0
  });
  assert.equal(
    clicks.press({
      point: HERE,
      time: 100,
      button: RIGHT_BUTTON
    }), 1
  );
  assert.equal(
    clicks.press({
      point: HERE,
      time: 200,
      button: RIGHT_BUTTON
    }), 2
  );
});
