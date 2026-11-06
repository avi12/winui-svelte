import { read } from "#src/renderer/host/reflect.js";
import { FakeMotionPanel } from "#src/renderer/testing/fake-controls.js";
import { createTreeRenderer } from "#src/renderer/tree/tree.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// ScrollTimeline and ViewTimeline on the web, and element.animate() with a
// timeline, on a stand-in control: the checks that come before WinUI is asked
// for a scroll viewer (the rules about what Composition can drive, reduced
// motion, the axis). The Composition link itself is test/scroll-timeline.test.ts's.

const { installAnimations } = await import("./animations.ts");
const { installScrollTimeline, ScrollLinkedAnimation, ScrollTimeline, ViewTimeline } = await import("./scroll-timeline.ts");

const FADE = [{ opacity: 1 }, { opacity: 0 }];

function setup({ isMotionReduced = false }: { isMotionReduced?: boolean } = {}) {
  const uninstallAnimations = installAnimations({
    isMotionReduced: () => false,
    warn: () => undefined
  });
  const uninstall = installScrollTimeline({ isMotionReduced: () => isMotionReduced });
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
    element,
    uninstall() {
      uninstall();
      uninstallAnimations();
    }
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

  return animate.call(element, keyframes, options);
}

test("a scroll timeline reads block by default, takes x and inline, and refuses another axis", () => {
  assert.equal(new ScrollTimeline().axis, "block");
  assert.equal(new ScrollTimeline({ axis: "inline" }).axis, "inline");
  assert.throws(() => new ScrollTimeline({ axis: "diagonal" }), /axis must be block, inline, x or y, found "diagonal"/u);
});

test("a timeline with no scroll viewer has no time, and lasts 100 percent", () => {
  const timeline = new ScrollTimeline();
  assert.equal(timeline.currentTime, null);
  assert.deepEqual(timeline.duration, {
    value: 100,
    unit: "percent"
  });
  assert.equal(timeline.source, null);
});

test("a view timeline keeps its subject, refuses a bad inset, and is a scroll timeline", () => {
  const subject = {};
  const timeline = new ViewTimeline({
    subject,
    axis: "x",
    inset: ["10px", "20%"]
  });
  assert.equal(timeline.subject, subject);
  assert.ok(timeline instanceof ScrollTimeline);
  assert.equal(timeline.currentTime, null);
  assert.throws(() => new ViewTimeline({
    subject,
    inset: "2em"
  }), /inset: expected auto, a length in px or a percentage, found "2em"/u);
});

test("installing defines the classes and uninstalling takes them away", () => {
  const { uninstall } = setup();
  assert.equal(read(globalThis, "ScrollTimeline"), ScrollTimeline);
  assert.equal(read(globalThis, "ViewTimeline"), ViewTimeline);
  uninstall();
  assert.equal("ScrollTimeline" in globalThis, false);
});

test("under reduced motion a scroll-linked animation does not start", () => {
  const { element, uninstall } = setup({ isMotionReduced: true });
  const animation = animateOn({
    element,
    keyframes: FADE,
    options: {
      timeline: new ScrollTimeline()
    }
  });
  assert.ok(animation instanceof ScrollLinkedAnimation);
  assert.equal(animation.playState, "idle");
  uninstall();
});

test("a scroll-linked animation refuses what Composition cannot drive from a scroll position", () => {
  const { element, uninstall } = setup();
  const timeline = new ScrollTimeline();
  assert.throws(() => animateOn({
    element,
    keyframes: {
      width: ["10px", "40px"]
    },
    options: {
      timeline
    }
  }), /Width cannot be driven from a scroll position \(opacity, translate, scale and rotate can\)/u);
  assert.throws(() => animateOn({
    element,
    keyframes: FADE,
    options: {
      timeline,
      easing: "ease-in"
    }
  }), /use easing: "linear"/u);
  assert.throws(() => animateOn({
    element,
    keyframes: FADE,
    options: {
      timeline,
      iterations: 3
    }
  }), /iterations must be 1/u);
  uninstall();
});

test("a scroll-linked animation of a supported property needs both elements in a window", () => {
  const { element, uninstall } = setup();
  assert.throws(() => animateOn({
    element,
    keyframes: FADE,
    options: {
      timeline: new ScrollTimeline()
    }
  }), /must be in a window/u);
  uninstall();
});

test("an animation without a timeline goes on to the Web Animations API", () => {
  const { element, uninstall } = setup();
  const animation = animateOn({
    element,
    keyframes: FADE,
    options: 100
  });
  assert.equal(animation instanceof ScrollLinkedAnimation, false);
  uninstall();
});
