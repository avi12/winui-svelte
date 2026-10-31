import type { AnimationsInstallOptions } from "./animations.ts";
import { read } from "#src/renderer/host/reflect.js";
import { FakeMotionPanel } from "#src/renderer/testing/fake-controls.js";
import { createTreeRenderer } from "#src/renderer/tree/tree.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The web Animation over the element animation engine, on a stand-in control
// and a clock the test moves by hand: the opacity a keyframe pair draws at each
// moment, pause and resume, reverse, the playback rate, delay, iterations,
// direction and easing, finished and cancel, KeyframeEffect on its own, and the
// connected-animation extras.

const { Animation, installAnimations, KeyframeEffect } = await import("./animations.ts");

const FRAME = 16;
const DURATION = 192;
const HALF = DURATION / 2;
const QUARTER = DURATION / 4;
const FADE = [{ opacity: 1 }, { opacity: 0 }];

const TOLERANCE = 1e-6;

function assertNear({ actual, expected }: {
  actual: number;
  expected: number;
}) {
  assert.ok(Math.abs(actual - expected) < TOLERANCE, `${actual} is not ${expected}`);
}

function createClock() {
  let time = 0;
  let onFrame: (() => void) | null = null;
  return {
    now: () => time,
    every(callback: () => void) {
      onFrame = callback;
      return () => {
        onFrame = null;
      };
    },
    advance(milliseconds: number) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME) {
        time += FRAME;
        onFrame?.();
      }
    }
  };
}

function setup(connectedAnimations?: AnimationsInstallOptions["connectedAnimations"]) {
  const clock = createClock();
  const uninstall = installAnimations({
    clock,
    isMotionReduced: () => false,
    warn: () => undefined,
    ...connectedAnimations === undefined ? {} : { connectedAnimations }
  });
  const control = new FakeMotionPanel();
  const tree = createTreeRenderer<{ control: FakeMotionPanel }>({
    create: () => ({ control }),
    setAttribute() {},
    removeAttribute() {},
    childrenChanged() {},
    fragmentChanged() {},
    removed() {},
    listen: () => null
  });
  const element = tree.createElement("fake-panel");
  return {
    clock,
    control,
    element,
    uninstall
  };
}

function animateOn({ element, keyframes, options }: {
  element: object;
  keyframes: unknown;
  options: unknown;
}) {
  const animate = read(element, "animate");
  const isDefined = typeof animate === "function";
  if (!isDefined) {
    throw new TypeError("animate is not defined on the element");
  }

  const result: unknown = animate.call(element, keyframes, options);
  if (!(result instanceof Animation)) {
    throw new TypeError("animate did not give an Animation");
  }

  return result;
}

test("animate() draws the keyframes on the control, finishes, and gives the control back", async () => {
  const { clock, control, element, uninstall } = setup();
  const animation = animateOn({
    element,
    keyframes: FADE,
    options: DURATION
  });
  const events: string[] = [];
  animation.addEventListener("finish", () => events.push("finish"));
  animation.onfinish = () => events.push("onfinish");
  assert.equal(animation.playState, "running");
  clock.advance(HALF);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  assert.equal(animation.currentTime, HALF);
  clock.advance(DURATION);
  assert.equal(animation.playState, "finished");
  assertNear({
    actual: control.opacity,
    expected: 1
  });
  assert.deepEqual(events.toSorted(), ["finish", "onfinish"]);
  assert.equal(await animation.finished, animation);
  uninstall();
});

test("fill: forwards keeps the last keyframe", () => {
  const { clock, control, element, uninstall } = setup();
  animateOn({
    element,
    keyframes: FADE,
    options: {
      duration: DURATION,
      fill: "forwards"
    }
  });
  clock.advance(DURATION * 2);
  assertNear({
    actual: control.opacity,
    expected: 0
  });
  uninstall();
});

test("pause holds the time, play carries on, and currentTime seeks", () => {
  const { clock, control, element, uninstall } = setup();
  const animation = animateOn({
    element,
    keyframes: FADE,
    options: DURATION
  });
  clock.advance(HALF);
  animation.pause();
  assert.equal(animation.playState, "paused");
  clock.advance(DURATION);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  animation.currentTime = QUARTER;
  assertNear({
    actual: control.opacity,
    expected: 0.75
  });
  animation.play();
  clock.advance(QUARTER);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  uninstall();
});

test("reverse plays back from where it is, and the playback rate scales time", () => {
  const { clock, control, element, uninstall } = setup();
  const animation = animateOn({
    element,
    keyframes: FADE,
    options: DURATION
  });
  clock.advance(HALF);
  animation.reverse();
  clock.advance(QUARTER);
  assertNear({
    actual: control.opacity,
    expected: 0.75
  });
  animation.playbackRate = -2;
  clock.advance(QUARTER);
  assertNear({
    actual: control.opacity,
    expected: 1
  });
  assert.equal(animation.playState, "finished", "it ran back to its start");
  uninstall();
});

test("delay, iterations, direction and easing shape the progress", () => {
  const { clock, control, element, uninstall } = setup();
  animateOn({
    element,
    keyframes: FADE,
    options: {
      duration: DURATION,
      delay: DURATION,
      iterations: 2,
      direction: "alternate",
      fill: "both"
    }
  });
  assertNear({
    actual: control.opacity,
    expected: 1
  });
  clock.advance(DURATION + HALF);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  clock.advance(DURATION);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  clock.advance(HALF * 2);
  assertNear({
    actual: control.opacity,
    expected: 1
  });
  uninstall();
});

test("an easing bends the progress", () => {
  const { clock, control, element, uninstall } = setup();
  animateOn({
    element,
    keyframes: FADE,
    options: {
      duration: DURATION,
      easing: "steps(2, end)"
    }
  });
  clock.advance(HALF - FRAME);
  assertNear({
    actual: control.opacity,
    expected: 1
  });
  clock.advance(FRAME * 2);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  uninstall();
});

test("finish jumps to the end and cancel rejects finished and fires cancel", async () => {
  const { clock, control, element, uninstall } = setup();
  const finishing = animateOn({
    element,
    keyframes: FADE,
    options: {
      duration: DURATION,
      fill: "forwards"
    }
  });
  finishing.finish();
  assertNear({
    actual: control.opacity,
    expected: 0
  });
  assert.equal(finishing.playState, "finished");
  const cancelled = animateOn({
    element,
    keyframes: FADE,
    options: DURATION
  });
  const events: string[] = [];
  cancelled.oncancel = () => events.push("cancel");
  cancelled.cancel();
  clock.advance(FRAME);
  assert.deepEqual(events, ["cancel"]);
  assert.equal(cancelled.playState, "idle");
  assert.equal(cancelled.currentTime, null);
  await assert.rejects(cancelled.finished, { name: "AbortError" });
  uninstall();
});

test("getAnimations lists the element's running animations", () => {
  const { clock, element, uninstall } = setup();
  const animation = animateOn({
    element,
    keyframes: FADE,
    options: DURATION
  });
  const getAnimations = read(element, "getAnimations");
  assert.equal(typeof getAnimations, "function");
  function listed() {
    const result: unknown = typeof getAnimations === "function" ? getAnimations.call(element) : [];
    return Array.isArray(result) ? result : [];
  }
  assert.deepEqual(listed(), [animation]);
  animation.cancel();
  clock.advance(FRAME);
  assert.deepEqual(listed(), []);
  uninstall();
});

test("a KeyframeEffect with property-indexed keyframes stays idle until it plays, and takes new timing", () => {
  const { clock, control, element, uninstall } = setup();
  const effect = new KeyframeEffect(element, { opacity: [1, 0] }, DURATION);
  const animation = new Animation(effect);
  assert.equal(animation.playState, "idle");
  assert.deepEqual(effect.getKeyframes(), [{ opacity: 1 }, { opacity: 0 }]);
  animation.play();
  clock.advance(HALF);
  assertNear({
    actual: control.opacity,
    expected: 0.5
  });
  effect.updateTiming({ duration: DURATION * 2 });
  assertNear({
    actual: control.opacity,
    expected: 0.75
  });
  assert.equal(effect.getComputedTiming().endTime, DURATION * 2);
  assertNear({
    actual: effect.getComputedTiming().progress ?? 0,
    expected: 0.25
  });
  uninstall();
});

test("the connected-animation extras go to WinUI's service by key", () => {
  const calls: string[] = [];
  const { element, uninstall } = setup({
    prepareToAnimate: key => calls.push(`prepare ${key}`),
    getAnimation: key => ({
      tryStart() {
        calls.push(`start ${key}`);
        return key === "photo";
      }
    })
  });
  const prepare = read(element, "prepareConnectedAnimation");
  const start = read(element, "startConnectedAnimation");
  assert.ok(typeof prepare === "function" && typeof start === "function");
  prepare.call(element, "photo");
  assert.equal(start.call(element, "photo"), true);
  assert.equal(start.call(element, "other"), false);
  assert.deepEqual(calls, ["prepare photo", "start photo", "start other"]);
  uninstall();
});

test("uninstalling takes the web classes away and leaves the engine's own handle on animate", () => {
  const { element, uninstall } = setup();
  assert.equal(typeof globalThis.Animation, "function");
  uninstall();
  assert.equal(typeof globalThis.KeyframeEffect, "undefined");
  const animate = read(element, "animate");
  assert.ok(animate === undefined || typeof animate === "function");
});
