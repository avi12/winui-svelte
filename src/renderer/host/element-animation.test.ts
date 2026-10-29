import { registerControls } from "./host.ts";
import { call, read } from "./reflect.ts";
import { fakeControls, FakeMotionPanel } from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

// Transition attachments on the WinUI renderer, run on stand-in controls and
// a clock the test moves by hand: an element that leaves stays until its
// outro has run, the control's properties step with svelte/transition's
// keyframes and go back, and what WinUI cannot animate is said once.

registerControls(fakeControls);
registerHooks(svelteHooks());
const { enableElementAnimation } = await import("./element-animation.ts");
const { mountControl } = await import("./mount.svelte.ts");
const { default: Fixture } = await import("#src/renderer/testing/Transitions.fixture.svelte");

const FRAME = 16;
// The fixture's transitions run 100 milliseconds.
const PAST_THE_END = 200;
const FLY_DISTANCE = 20;
// A frame is 16 of the fade's 100 milliseconds.
const ONE_FRAME_OF_THE_FADE = 0.17;

interface Props {
  isShown: boolean;
  isSliding: boolean;
  isFlying: boolean;
  isScaling: boolean;
}

const hidden: Props = {
  isShown: false,
  isSliding: false,
  isFlying: false,
  isScaling: false
};

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
    get isRunning() {
      return onFrame !== null;
    },
    advance(milliseconds: number) {
      for (let elapsed = 0; elapsed < milliseconds; elapsed += FRAME) {
        time += FRAME;
        onFrame?.();
      }
    }
  };
}

function mountFixture(overrides: Partial<Props> = {}) {
  const clock = createClock();
  const warnings: string[] = [];
  const disable = enableElementAnimation({
    clock,
    warn: message => warnings.push(message)
  });
  const mounted = mountControl<Props>({
    component: Fixture,
    props: {
      ...hidden,
      ...overrides
    }
  });
  const root: object = mounted.root;
  assert.ok(root instanceof FakeMotionPanel);
  return {
    clock,
    warnings,
    mounted,
    root,
    finish() {
      mounted.unmount();
      disable();
    }
  };
}

function panelsOf(panel: FakeMotionPanel) {
  return panel.children.items.filter(item => item instanceof FakeMotionPanel);
}

function isNonDecreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value >= (values[index - 1] ?? 0));
}

test("an element fades in, and leaves only once its outro has run", () => {
  const { clock, root, mounted, finish } = mountFixture();
  mounted.set({ isShown: true });
  const [shown] = panelsOf(root);
  assert.ok(shown);
  assert.equal(shown.opacity, 0, "the intro starts hidden, not flashing visible");

  clock.advance(PAST_THE_END);
  assert.equal(shown.opacity, 1, "the intro ends on the control's own opacity");
  const rising = shown.opacities.slice(shown.opacities.indexOf(0));
  assert.ok(rising.length > 3, `${rising.length} opacities set`);
  assert.ok(isNonDecreasing(rising), "the opacity only rises");
  assert.equal(clock.isRunning, false, "the clock stops when nothing moves");

  shown.opacities.length = 0;
  mounted.set({ isShown: false });
  assert.deepEqual(panelsOf(root), [shown], "still there while it fades out");
  assert.equal(shown.isHitTestVisible, false, "and out of reach");

  clock.advance(FRAME * 3);
  assert.deepEqual(panelsOf(root), [shown]);
  assert.ok(shown.opacity > 0 && shown.opacity < 1, `${shown.opacity} part-way`);

  clock.advance(PAST_THE_END);
  assert.deepEqual(panelsOf(root), [], "gone once the outro ended");
  assert.equal(shown.opacity, 0, "faded to nothing, not left half-visible");
  assert.equal(clock.isRunning, false);
  finish();
});

test("an element shown again during its outro is a new one, and the old one still leaves", () => {
  const { clock, root, mounted, finish } = mountFixture();
  mounted.set({ isShown: true });
  clock.advance(PAST_THE_END);
  const [leaving] = panelsOf(root);
  assert.ok(leaving);

  mounted.set({ isShown: false });
  clock.advance(FRAME * 3);
  mounted.set({ isShown: true });
  const [, entering] = panelsOf(root);
  assert.ok(entering && entering !== leaving);
  assert.equal(entering.opacity, 0);

  clock.advance(PAST_THE_END);
  assert.deepEqual(panelsOf(root), [entering]);
  assert.equal(entering.opacity, 1);
  finish();
});

test("an outro that interrupts an intro goes on from where the intro had got to", () => {
  const { clock, root, mounted, finish } = mountFixture();
  mounted.set({ isShown: true });
  const [shown] = panelsOf(root);
  assert.ok(shown);
  clock.advance(FRAME * 3);
  const midway = shown.opacity;
  assert.ok(midway > 0 && midway < 1, `${midway} part-way`);

  shown.opacities.length = 0;
  mounted.set({ isShown: false });
  clock.advance(PAST_THE_END);
  assert.ok(Math.max(...shown.opacities) <= midway + ONE_FRAME_OF_THE_FADE, "it does not jump back up to full");
  assert.deepEqual(panelsOf(root), []);
  finish();
});

test("out: moves the control, and an element removed with its block is not held", () => {
  const { clock, root, mounted, finish } = mountFixture({ isFlying: true });
  const [flying] = panelsOf(root);
  assert.ok(flying);
  assert.deepEqual(flying.translation, {
    x: 0,
    y: 0,
    z: 0
  }, "no intro: it is where it is");

  mounted.set({ isFlying: false });
  assert.deepEqual(panelsOf(root), [flying]);
  clock.advance(FRAME * 3);
  assert.ok(flying.translation.y > 0 && flying.translation.y < FLY_DISTANCE, `${flying.translation.y} part-way`);

  clock.advance(PAST_THE_END);
  assert.deepEqual(panelsOf(root), []);
  assert.equal(flying.translation.y, FLY_DISTANCE, "it ends where the outro sends it");
  finish();
});

test("in: scales about the middle and gives the control's own center point back", () => {
  const { clock, root, mounted, finish } = mountFixture();
  mounted.set({ isScaling: true });
  const [scaling] = panelsOf(root);
  assert.ok(scaling);
  assert.equal(scaling.scale.x, 0);
  assert.deepEqual(scaling.centerPoint, {
    x: 50,
    y: 10,
    z: 0
  });

  clock.advance(PAST_THE_END);
  assert.deepEqual(scaling.scale, {
    x: 1,
    y: 1,
    z: 1
  });
  assert.deepEqual(scaling.centerPoint, {
    x: 0,
    y: 0,
    z: 0
  });
  finish();
});

test("a property WinUI cannot animate is named once and the rest still runs", () => {
  const { clock, warnings, root, mounted, finish } = mountFixture();
  mounted.set({ isSliding: true });
  clock.advance(PAST_THE_END);
  const [sliding] = panelsOf(root);
  assert.ok(sliding);
  assert.equal(warnings.length, 1);
  assert.match(warnings.join(), /height/u);
  assert.ok(sliding.opacities.some(opacity => opacity > 0 && opacity < 1), "the opacity of a slide still steps");

  mounted.set({ isSliding: false });
  clock.advance(PAST_THE_END);
  assert.deepEqual(panelsOf(root), [], "and it leaves when its outro ends");
  assert.equal(warnings.length, 1);
  finish();
});

test("getComputedStyle answers for a WinUI element and refuses anything else", () => {
  const { finish } = mountFixture();
  assert.throws(() => call(globalThis, "getComputedStyle", {}), TypeError);
  finish();
  assert.equal(read(globalThis, "getComputedStyle"), undefined, "turned off, it is as it was");
});
