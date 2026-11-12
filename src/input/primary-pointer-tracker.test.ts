import { createPrimaryPointerTracker, PointerRole, PressOutcome } from "./primary-pointer-tracker.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const FINGER = {
  pointerId: 7,
  button: 0
};
const SECOND_FINGER = {
  pointerId: 8,
  button: 0
};
const RIGHT_BUTTON = {
  pointerId: 1,
  button: 2
};
const MIDDLE_BUTTON = {
  pointerId: 1,
  button: 1
};
const PEN_BARREL = {
  pointerId: 5,
  button: 2
};
const PEN_ERASER = {
  pointerId: 5,
  button: 5
};

test("the first primary press starts the gesture", () => {
  const tracker = createPrimaryPointerTracker();
  assert.deepEqual(tracker.press(FINGER), {
    pointerId: FINGER.pointerId,
    role: PointerRole.primary,
    outcome: PressOutcome.started
  });
  assert.equal(tracker.isActive, true);
});

test("a second pointer is ignored while the first is down", () => {
  const tracker = createPrimaryPointerTracker();
  tracker.press(FINGER);
  assert.equal(tracker.press(SECOND_FINGER).outcome, PressOutcome.ignored);
  assert.equal(tracker.move(SECOND_FINGER.pointerId).isFollowed, false);
  assert.equal(tracker.release(SECOND_FINGER.pointerId).isEnded, false);
  assert.equal(tracker.isActive, true);
});

test("the first pointer is followed until it lifts, then a new gesture can start", () => {
  const tracker = createPrimaryPointerTracker();
  tracker.press(FINGER);
  assert.deepEqual(tracker.move(FINGER.pointerId), {
    pointerId: FINGER.pointerId,
    isFollowed: true
  });
  assert.deepEqual(tracker.release(FINGER.pointerId), {
    pointerId: FINGER.pointerId,
    isEnded: true
  });
  assert.equal(tracker.isActive, false);
  assert.equal(tracker.press(SECOND_FINGER).outcome, PressOutcome.started);
});

test("a move is followed while nothing is down (hover)", () => {
  assert.equal(createPrimaryPointerTracker().move(RIGHT_BUTTON.pointerId).isFollowed, true);
});

test("a mouse's right button, a pen's barrel button and its eraser are secondary, and start nothing", () => {
  const tracker = createPrimaryPointerTracker();
  for (const report of [RIGHT_BUTTON, PEN_BARREL, PEN_ERASER, MIDDLE_BUTTON]) {
    const result = tracker.press(report);
    assert.equal(result.role, PointerRole.secondary);
    assert.equal(result.outcome, PressOutcome.secondary);
    assert.equal(tracker.isActive, false);
  }
});

test("a secondary press during a gesture is ignored and the gesture goes on", () => {
  const tracker = createPrimaryPointerTracker();
  tracker.press(FINGER);
  const result = tracker.press(PEN_BARREL);
  assert.equal(result.role, PointerRole.secondary);
  assert.equal(result.outcome, PressOutcome.ignored);
  assert.equal(tracker.isActive, true);
});
