import assert from "node:assert/strict";
import { test } from "node:test";

// The animation frame and idle callbacks over a clock the test moves by hand:
// order, one run each, cancelling, the idle period and its timeout, and a
// failing callback not taking the others down.

const { installTiming } = await import("./timing.ts");

const FRAME = 16;
const START = 100;

function createClock() {
  let time = START;
  let onFrame: (() => void) | null = null;
  return {
    now: () => time,
    every(callback: () => void) {
      onFrame = callback;
      return () => {
        onFrame = null;
      };
    },
    get isRunning() {
      return onFrame !== null;
    },
    advance(milliseconds: number) {
      time += milliseconds;
      onFrame?.();
    }
  };
}

test("frame callbacks run once, in order, with the frame's time", () => {
  const clock = createClock();
  const uninstall = installTiming({ clock });
  const seen: Array<[string, number]> = [];
  requestAnimationFrame(time => seen.push(["a", time]));
  requestAnimationFrame(time => seen.push(["b", time]));
  assert.deepEqual(seen, []);
  clock.advance(FRAME);
  clock.advance(FRAME);
  assert.deepEqual(seen, [["a", START + FRAME], ["b", START + FRAME]]);
  assert.equal(clock.isRunning, false, "the timer stops with nothing to run");
  uninstall();
});

test("cancelAnimationFrame removes a request, and a callback may ask for the next frame", () => {
  const clock = createClock();
  const uninstall = installTiming({ clock });
  const seen: string[] = [];
  const id = requestAnimationFrame(() => seen.push("cancelled"));
  cancelAnimationFrame(id);
  let count = 0;
  function again() {
    count++;

    const isMore = count < 3;
    if (isMore) {
      requestAnimationFrame(again);
    }
  }
  requestAnimationFrame(again);
  for (let i = 0; i < 5; i++) {
    clock.advance(FRAME);
  }

  assert.deepEqual(seen, []);
  assert.equal(count, 3);
  uninstall();
});

test("an idle callback runs after the frame callbacks, with time left", () => {
  const clock = createClock();
  const uninstall = installTiming({ clock });
  const order: string[] = [];
  requestIdleCallback(deadline => {
    order.push(`idle ${deadline.didTimeout} ${deadline.timeRemaining() > 0}`);
  });
  requestAnimationFrame(() => order.push("frame"));
  clock.advance(FRAME);
  assert.deepEqual(order, ["frame", "idle false true"]);
  uninstall();
});

test("an idle callback that asked for a timeout says so, and cancelIdleCallback removes one", () => {
  const clock = createClock();
  const uninstall = installTiming({ clock });
  const seen: string[] = [];
  const id = requestIdleCallback(() => seen.push("cancelled"));
  cancelIdleCallback(id);
  requestIdleCallback(deadline => seen.push(`timeout ${deadline.didTimeout}`), { timeout: 10 });
  clock.advance(FRAME);
  assert.deepEqual(seen, ["timeout true"]);
  uninstall();
});

test("a callback that throws does not stop the others", () => {
  const clock = createClock();
  const uninstall = installTiming({ clock });
  const reported: unknown[] = [];
  const original = console.error;
  console.error = (error: unknown) => reported.push(error);
  try {
    const seen: string[] = [];
    requestAnimationFrame(() => {
      throw new Error("boom");
    });
    requestAnimationFrame(() => seen.push("second"));
    clock.advance(FRAME);
    assert.deepEqual(seen, ["second"]);
    assert.equal(reported.length, 1);
  } finally {
    console.error = original;
    uninstall();
  }
});

test("uninstalling takes the functions away and stops the timer", () => {
  const clock = createClock();
  const uninstall = installTiming({ clock });
  requestAnimationFrame(() => undefined);
  uninstall();
  assert.equal(clock.isRunning, false);
  assert.equal(typeof globalThis.requestAnimationFrame, "undefined");
  assert.equal(typeof globalThis.requestIdleCallback, "undefined");
});
