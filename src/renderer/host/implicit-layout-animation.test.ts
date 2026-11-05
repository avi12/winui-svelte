import { implicitLayoutAnimation, LayoutEasing } from "./implicit-layout-animation.ts";
import type { ImplicitLayoutHost } from "./implicit-layout-animation.ts";
import type { UIElement } from "#winui/microsoft/ui/xaml/UIElement";
import assert from "node:assert/strict";
import { test } from "node:test";

// The attachment on stand-ins: a panel whose children and layout events the
// test drives, a compositor that records what it was asked to build, and a
// host whose reduced motion the test switches.

const MILLISECOND_TICKS = 10_000n;

interface Built {
  targets: string[];
  durations: bigint[];
  frames: Array<{
    progress: number;
    expression: string;
    hasEasing: boolean;
  }>;
  curves: Array<[number, number, number, number]>;
}

function setUp({ isReduced = false } = {}) {
  const built: Built = {
    targets: [],
    durations: [],
    frames: [],
    curves: []
  };
  const inserted = new Map<string, unknown>();
  const collection = {
    insert(key: string, value: unknown) {
      inserted.set(key, value);
      return true;
    },
    clear() {
      inserted.clear();
    }
  };
  const compositor = {
    createVector3KeyFrameAnimation() {
      const animation = {
        set target(value: string) {
          built.targets.push(value);
        },
        set duration(value: {
          duration: bigint;
        }) {
          built.durations.push(value.duration);
        },
        insertExpressionKeyFrame(progress: number, expression: string, easing?: unknown) {
          built.frames.push({
            progress,
            expression,
            hasEasing: easing !== undefined
          });
        }
      };
      return animation;
    },
    createCubicBezierEasingFunction(first: {
      x: number;
      y: number;
    }, second: {
      x: number;
      y: number;
    }) {
      built.curves.push([first.x, first.y, second.x, second.y]);
      return {};
    },
    createImplicitAnimationCollection() {
      return collection;
    }
  };
  const visuals = new Map<UIElement, {
    compositor: typeof compositor;
    implicitAnimations: unknown;
  }>();
  const layoutListeners = new Set<() => void>();
  const motionListeners = new Set<() => void>();
  const state = { isReduced };
  const host = {
    visualOf(element: UIElement) {
      const known = visuals.get(element);
      const isKnown = known !== undefined;
      if (isKnown) {
        // oxlint-disable-next-line typescript/consistent-type-assertions -- a stand-in for a Visual
        return known as unknown as ReturnType<ImplicitLayoutHost["visualOf"]>;
      }

      const visual = {
        compositor,
        implicitAnimations: null
      };
      visuals.set(element, visual);
      // oxlint-disable-next-line typescript/consistent-type-assertions -- a stand-in for a Visual
      return visual as unknown as ReturnType<ImplicitLayoutHost["visualOf"]>;
    },
    isMotionReduced: () => state.isReduced,
    onMotionChanged(callback: () => void) {
      motionListeners.add(callback);
      return () => motionListeners.delete(callback);
    }
  } satisfies ImplicitLayoutHost;
  const children: UIElement[] = [];
  const node = {
    native: {
      control: {
        children,
        onLayoutUpdated(listener: () => void) {
          layoutListeners.add(listener);
          return () => layoutListeners.delete(listener);
        }
      }
    }
  };
  return {
    built,
    children,
    collection,
    host,
    inserted,
    layoutListeners,
    motionListeners,
    node,
    state,
    visuals
  };
}

function child(name: string) {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- a stand-in for a UIElement
  return { name } as unknown as UIElement;
}

test("every child slides its Offset to the final value over the duration, on the chosen curve", () => {
  const world = setUp();
  const first = child("first");
  world.children.push(first, child("second"));
  const attach = implicitLayoutAnimation({
    duration: 300,
    easing: LayoutEasing.EASE_IN_OUT,
    host: world.host
  });
  attach(world.node);
  assert.deepEqual(world.built.targets, ["Offset"]);
  assert.deepEqual(world.built.durations, [300n * MILLISECOND_TICKS]);
  assert.deepEqual(world.built.frames, [{
    progress: 1,
    expression: "this.FinalValue",
    hasEasing: true
  }]);
  assert.deepEqual(world.built.curves, [[0.42, 0, 0.58, 1]]);
  assert.equal(world.inserted.size, 1);
  assert.equal(world.visuals.get(first)?.implicitAnimations, world.collection);
  assert.equal(world.visuals.size, 2);
});

test("a child added later is picked up on the next layout, and the first ones are not set twice", () => {
  const world = setUp();
  world.children.push(child("first"));
  implicitLayoutAnimation({ host: world.host })(world.node);
  const late = child("late");
  world.children.push(late);
  for (const listener of world.layoutListeners) {
    listener();
  }

  assert.equal(world.visuals.get(late)?.implicitAnimations, world.collection);
  assert.equal(world.built.targets.length, 1, "one animation serves every child");
});

test("with animation effects off nothing is attached, and turning them on attaches", () => {
  const world = setUp({ isReduced: true });
  const only = child("only");
  world.children.push(only);
  implicitLayoutAnimation({ host: world.host })(world.node);
  assert.equal(world.visuals.size, 0);
  world.state.isReduced = false;
  for (const listener of world.motionListeners) {
    listener();
  }

  assert.equal(world.visuals.get(only)?.implicitAnimations, world.collection);
  world.state.isReduced = true;
  for (const listener of world.motionListeners) {
    listener();
  }

  assert.equal(world.inserted.size, 0, "the animation was taken out");
});

test("the cleanup stops listening and takes the animation out", () => {
  const world = setUp();
  world.children.push(child("only"));
  const stop = implicitLayoutAnimation({ host: world.host })(world.node);
  assert.equal(typeof stop, "function");
  stop?.();
  assert.equal(world.layoutListeners.size, 0);
  assert.equal(world.motionListeners.size, 0);
  assert.equal(world.inserted.size, 0);
});

test("an element that is not a panel is left alone", () => {
  const world = setUp();
  const stop = implicitLayoutAnimation({ host: world.host })({
    native: {
      control: {}
    }
  });
  assert.equal(stop, undefined);
});
