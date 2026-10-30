import { registerControls } from "./host.ts";
import { call, read } from "./reflect.ts";
import { fakeControls, FakeMotionPanel, Line } from "#src/renderer/testing/fake-controls.js";
import { svelteHooks } from "#src/vite/loader.js";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

// Svelte's own transition: / in: / out: / animate: directives and its
// svelte/transition, svelte/animate and svelte/motion helpers on the WinUI
// renderer, run on stand-in controls and a clock the test moves by hand: an
// element that leaves stays until its outro has run, the control's properties
// step with the keyframes Svelte samples and go back, and what WinUI cannot
// animate is said once.

registerControls(fakeControls);
const ANIMATION_MODULE = pathToFileURL(new URL("./element-animation.ts", import.meta.url).pathname.slice(1)).href;
registerHooks(svelteHooks({ animationRuntime: ANIMATION_MODULE }));
const { enableElementAnimation } = await import("./element-animation.ts");
const { mountControl } = await import("./mount.svelte.ts");
const { default: Fixture } = await import("#src/renderer/testing/Transitions.fixture.svelte");
const { Tween } = await import("svelte/motion");

const FRAME = 16;
// The fixture's transitions run 100 milliseconds.
const PAST_THE_END = 200;
const FLY_DISTANCE = 20;
// A frame is 16 of the fade's 100 milliseconds.
const ONE_FRAME_OF_THE_FADE = 0.17;
const FAKE_ROW_HEIGHT = 20;
// The fake line runs from (0, 0) to (30, 40), with a stroke 2 thick.
const LINE_LENGTH = 50;
const STROKE_THICKNESS = 2;
const STATIC_PANELS = 5;

interface Props {
  isShown: boolean;
  isSliding: boolean;
  isFlying: boolean;
  isScaling: boolean;
  isBlurring: boolean;
  isDrawing: boolean;
  isOnTheLeft: boolean;
  isLogged: boolean;
  isNested: boolean;
  isInner: boolean;
  ids: number[];
  rows: number[];
  log: (event: string) => void;
}

const hidden: Props = {
  isShown: false,
  isSliding: false,
  isFlying: false,
  isScaling: false,
  isBlurring: false,
  isDrawing: false,
  isOnTheLeft: true,
  isLogged: false,
  isNested: false,
  isInner: true,
  ids: [],
  rows: [],
  log() {}
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

function mountFixture({ intro: isIntro, ...overrides }: Partial<Props> & {
  intro?: boolean;
} = {}) {
  const clock = createClock();
  const warnings: string[] = [];
  const dashes: number[][] = [];
  const disable = enableElementAnimation({
    clock,
    warn: message => warnings.push(message),
    createDashes(lengths) {
      dashes.push(lengths);
      return lengths;
    }
  });
  const mounted = mountControl<Props>({
    component: Fixture,
    props: {
      ...hidden,
      ...overrides
    },
    ...isIntro !== undefined && {
      intro: isIntro
    }
  });
  const root: object = mounted.root;
  assert.ok(root instanceof FakeMotionPanel);
  return {
    clock,
    warnings,
    dashes,
    mounted,
    root,
    finish() {
      mounted.unmount();
      disable();
    }
  };
}

// What the fixture shows by itself: its panels, less the three that are always there.
function panelsOf(panel: FakeMotionPanel) {
  return panel.children.items.filter(item => item instanceof FakeMotionPanel).slice(0, -STATIC_PANELS);
}

function staticPanelsOf(panel: FakeMotionPanel) {
  const panels = panel.children.items.filter(item => item instanceof FakeMotionPanel);
  const [list, rows, nesting, left, right] = panels.slice(-STATIC_PANELS);
  assert.ok(list && rows && nesting && left && right);
  return {
    list,
    rows,
    nesting,
    left,
    right
  };
}

function isNonDecreasing(values: number[]) {
  return values.every((value, index) => index === 0 || value >= (values[index - 1] ?? 0));
}

test("transition:fade fades in, and the element leaves only once its outro has run", () => {
  const { clock, root, mounted, finish } = mountFixture();
  mounted.set({ isShown: true });
  const [shown] = panelsOf(root);
  assert.ok(shown);
  assert.equal(shown.opacity, 0, "the intro starts hidden, not flashing visible");

  clock.advance(PAST_THE_END);
  assert.equal(shown.opacity, 1, "the intro ends on the control's own opacity");
  const rising = shown.opacities.slice(shown.opacities.indexOf(0));
  assert.ok(rising.length > 3, `${rising.length} opacities set`);
  assert.ok(isNonDecreasing(rising), "the opacity only rises ");
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

test("an element shown again during its outro comes back, as the same one, and stays", () => {
  const { clock, root, mounted, finish } = mountFixture();
  mounted.set({ isShown: true });
  clock.advance(PAST_THE_END);
  const [leaving] = panelsOf(root);
  assert.ok(leaving);

  mounted.set({ isShown: false });
  clock.advance(FRAME * 3);
  mounted.set({ isShown: true });
  clock.advance(PAST_THE_END);
  assert.deepEqual(panelsOf(root), [leaving]);
  assert.equal(leaving.opacity, 1);
  assert.equal(leaving.isHitTestVisible, true, "and in reach again");
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

test("out:fly moves the control, and an element removed with its block is not held", () => {
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

test("in:scale scales about the middle and gives the control's own center point back", () => {
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

test("transition:slide grows and shrinks the height, and gives the control's own back", () => {
  const { clock, warnings, root, mounted, finish } = mountFixture();
  mounted.set({ isSliding: true });
  const [sliding] = panelsOf(root);
  assert.ok(sliding);
  assert.equal(sliding.height, 0, "it starts collapsed");

  clock.advance(FRAME * 3);
  assert.ok(sliding.height > 0 && sliding.height < FAKE_ROW_HEIGHT, `${sliding.height} part-way`);
  assert.ok(sliding.opacities.some(opacity => opacity > 0 && opacity < 1), "its opacity steps too");

  clock.advance(PAST_THE_END);
  assert.ok(Number.isNaN(sliding.height), "back to the height its content gives");
  assert.equal(sliding.opacity, 1);

  mounted.set({ isSliding: false });
  clock.advance(FRAME * 3);
  assert.ok(sliding.height > 0 && sliding.height < FAKE_ROW_HEIGHT, "collapsing");
  clock.advance(PAST_THE_END);
  assert.deepEqual(panelsOf(root), [], "and it leaves when its outro ends");
  assert.deepEqual(warnings, [], "nothing it says is lost");
  finish();
});

test("a property WinUI cannot animate (blur's filter) is named once and the rest still runs", () => {
  const { clock, warnings, root, mounted, finish } = mountFixture();
  mounted.set({ isBlurring: true });
  const [blurring] = panelsOf(root);
  assert.ok(blurring);
  clock.advance(PAST_THE_END);
  assert.equal(warnings.length, 1);
  assert.match(warnings.join(), /filter/u);
  assert.ok(blurring.opacities.some(opacity => opacity > 0 && opacity < 1), "the opacity of a blur still steps");
  assert.equal(blurring.opacity, 1);
  finish();
});

test("in:draw sets the dashes of a shape's stroke and takes them off again", () => {
  const { clock, dashes, root, mounted, finish } = mountFixture();
  mounted.set({ isDrawing: true });
  const [drawing] = panelsOf(root);
  assert.ok(drawing instanceof Line);
  assert.deepEqual(dashes[0], [LINE_LENGTH / STROKE_THICKNESS, LINE_LENGTH / STROKE_THICKNESS], "dashes as long as the line, in strokes");
  assert.equal(drawing.strokeDashOffset, LINE_LENGTH / STROKE_THICKNESS, "none of it drawn at first");

  clock.advance(FRAME * 3);
  assert.ok(drawing.strokeDashOffset > 0 && drawing.strokeDashOffset < LINE_LENGTH / STROKE_THICKNESS, `${drawing.strokeDashOffset} part-way`);

  clock.advance(PAST_THE_END);
  assert.equal(drawing.strokeDashOffset, 0, "all of it drawn");
  assert.equal(drawing.strokeDashArray, null, "and solid again");
  finish();
});

test("animate:flip moves an element that changed place from where it was", () => {
  const { clock, root, mounted, finish } = mountFixture({
    ids: [1, 2, 3]
  });
  const { list } = staticPanelsOf(root);
  const [first, second, third] = list.children.items;
  assert.ok(first instanceof FakeMotionPanel && second instanceof FakeMotionPanel && third instanceof FakeMotionPanel);

  mounted.set({ ids: [3, 1, 2] });
  assert.deepEqual(list.children.items, [third, first, second]);
  assert.equal(third.translation.y, FAKE_ROW_HEIGHT * 2, "the third starts two rows below where it now is");
  assert.equal(first.translation.y, -FAKE_ROW_HEIGHT, "the first starts a row above");

  clock.advance(FRAME * 3);
  assert.ok(third.translation.y > 0 && third.translation.y < FAKE_ROW_HEIGHT * 2, `${third.translation.y} on its way`);
  clock.advance(PAST_THE_END);
  assert.equal(third.translation.y, 0, "and it ends in its place");
  assert.equal(first.translation.y, 0);
  finish();
});

test("animate:flip moves the siblings of a leaving element into place while it leaves", () => {
  const { clock, root, mounted, finish } = mountFixture({
    rows: [1, 2, 3]
  });
  const { rows } = staticPanelsOf(root);
  const [leaving, second, third] = rows.children.items;
  assert.ok(leaving instanceof FakeMotionPanel);
  assert.ok(second instanceof FakeMotionPanel && third instanceof FakeMotionPanel);

  mounted.set({ rows: [2, 3] });
  assert.deepEqual(rows.children.items, [leaving, second, third], "the leaving element is still shown");
  assert.equal(leaving.margin.bottom, -FAKE_ROW_HEIGHT, "but takes no room along the panel");
  assert.equal(second.top, 0, "so the second is already where it will stay");
  assert.equal(second.translation.y, FAKE_ROW_HEIGHT, "and starts a row below, as flip moves it");
  assert.equal(third.translation.y, FAKE_ROW_HEIGHT);

  clock.advance(FRAME * 3);
  assert.ok(second.translation.y > 0 && second.translation.y < FAKE_ROW_HEIGHT, `${second.translation.y} on its way while the first fades`);
  assert.ok(leaving.opacity < 1 && leaving.opacity > 0, `${leaving.opacity} fading`);

  clock.advance(PAST_THE_END);
  assert.deepEqual(rows.children.items, [second, third], "the leaving element is removed");
  assert.equal(second.translation.y, 0, "and nothing jumps when it is");
  finish();
});

test("a leaving element that comes back gives its room back", () => {
  const { clock, root, mounted, finish } = mountFixture({
    rows: [1, 2]
  });
  const { rows } = staticPanelsOf(root);
  const [first, second] = rows.children.items;
  assert.ok(first instanceof FakeMotionPanel && second instanceof FakeMotionPanel);

  mounted.set({ rows: [2] });
  assert.equal(first.margin.bottom, -FAKE_ROW_HEIGHT);
  clock.advance(FRAME * 2);
  mounted.set({ rows: [1, 2] });
  assert.equal(first.margin.bottom, 0, "its own margin is back at once");
  assert.equal(second.top, FAKE_ROW_HEIGHT);
  clock.advance(PAST_THE_END);
  assert.deepEqual(rows.children.items, [first, second]);
  finish();
});

test("introstart, introend, outrostart and outroend reach the element's handlers", () => {
  const events: string[] = [];
  const { clock, mounted, finish } = mountFixture({
    log: event => events.push(event)
  });
  mounted.set({ isLogged: true });
  clock.advance(FRAME);
  assert.deepEqual(events, ["introstart"], "once the intro begins");
  clock.advance(PAST_THE_END);
  assert.deepEqual(events, ["introstart", "introend"]);

  mounted.set({ isLogged: false });
  clock.advance(FRAME);
  assert.deepEqual(events.slice(2), ["outrostart"]);
  clock.advance(PAST_THE_END);
  assert.deepEqual(events.slice(2), ["outrostart", "outroend"]);
  finish();
});

test("{intro: true} plays a global in: and transition: on the first render, and by default they wait", () => {
  const waiting = mountFixture({
    isLogged: true
  });
  const [still] = panelsOf(waiting.root);
  assert.ok(still);
  assert.deepEqual(still.opacities, [1], "no intro without the option");
  waiting.finish();

  const events: string[] = [];
  const introduced = mountFixture({
    isLogged: true,
    log: event => events.push(event),
    intro: true
  });
  const [fading] = panelsOf(introduced.root);
  assert.ok(fading);
  assert.equal(fading.opacity, 0, "the intro starts hidden");
  introduced.clock.advance(FRAME);
  assert.deepEqual(events, ["introstart"]);
  introduced.clock.advance(PAST_THE_END);
  assert.equal(fading.opacity, 1);
  assert.deepEqual(events, ["introstart", "introend"]);
  introduced.finish();
});

test("|local plays only when its own block comes in, |global whenever an ancestor does", () => {
  const { clock, root, mounted, finish } = mountFixture();
  const { nesting } = staticPanelsOf(root);

  mounted.set({ isNested: true });
  const [outer] = nesting.children.items;
  assert.ok(outer instanceof FakeMotionPanel);
  const [local, global] = outer.children.items;
  assert.ok(local instanceof FakeMotionPanel && global instanceof FakeMotionPanel);
  assert.deepEqual(local.opacities, [1], "the local one waits: its own block did not change");
  assert.equal(global.opacity, 0, "the global one plays");
  clock.advance(PAST_THE_END);

  mounted.set({ isInner: false });
  mounted.set({ isInner: true });
  const [again] = outer.children.items;
  assert.ok(again instanceof FakeMotionPanel);
  assert.equal(again.opacity, 0, "and now its own block came in, the local one plays");
  clock.advance(PAST_THE_END);
  finish();
});

test("crossfade sends an element out of one panel and receives it in the other", () => {
  const { clock, warnings, root, mounted, finish } = mountFixture();
  const { left, right } = staticPanelsOf(root);
  const [card] = left.children.items;
  assert.ok(card instanceof FakeMotionPanel);

  mounted.set({ isOnTheLeft: false });
  const [arriving] = right.children.items;
  assert.ok(arriving instanceof FakeMotionPanel && arriving !== card);
  assert.deepEqual(left.children.items, [card], "the old one stays while it is sent");
  clock.advance(FRAME * 3);
  assert.ok(arriving.opacity > 0 && arriving.opacity < 1, `${arriving.opacity} arriving`);
  assert.ok(card.opacity > 0 && card.opacity < 1, `${card.opacity} leaving`);
  assert.deepEqual(arriving.centerPoint, {
    x: 0,
    y: 0,
    z: 0
  }, "it scales from its corner, as crossfade asks");

  clock.advance(PAST_THE_END);
  assert.deepEqual(left.children.items, []);
  assert.deepEqual(right.children.items, [arriving]);
  assert.equal(arriving.opacity, 1);
  assert.deepEqual(arriving.scale, {
    x: 1,
    y: 1,
    z: 1
  });
  assert.deepEqual(warnings, []);
  finish();
});

test("getComputedStyle answers for a WinUI element and refuses anything else", () => {
  const { finish } = mountFixture();
  assert.throws(() => call(globalThis, "getComputedStyle", {}), TypeError);
  finish();
  assert.equal(read(globalThis, "getComputedStyle"), undefined, "turned off, it is as it was");
  assert.equal(read(globalThis, "requestAnimationFrame"), undefined);
});

test("enabling again without options keeps the one that is on", () => {
  const first = enableElementAnimation({ clock: createClock() });
  const second = enableElementAnimation();
  assert.equal(second, first);
  first();
});

test("svelte/motion's Tween steps on the animation frames", async () => {
  const disable = enableElementAnimation({
    clock: {
      now: () => performance.now(),
      every(onFrame) {
        const timer = setInterval(onFrame, FRAME / 4);
        return () => clearInterval(timer);
      }
    }
  });
  const tween = new Tween(0, { duration: FRAME * 2 });
  const finished = tween.set(1);
  await finished;
  assert.equal(tween.current, 1);
  disable();
});
