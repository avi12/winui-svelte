import type { EffectTiming, EffectTimingInput } from "./animation-timing.ts";
import { endTime, progressAt, resolveTiming } from "./animation-timing.ts";
import type { AnimationClock } from "./frame-clock.ts";
import { dispatcherClock } from "./frame-clock.ts";
import type { Keyframe, Pose, PoseValue, Vector } from "./keyframes.ts";
import { poseAt, PoseField, readKeyframe, touchedFields } from "./keyframes.ts";
import { keepsMotion } from "./motion-preference.ts";
import { isRecord, read, write } from "./reflect.ts";
import { shapeLength } from "./shape-length.ts";
import { doubleCollection } from "./values.ts";
import type { NativeValue } from "#src/native-value.js";
import { ElementNode } from "#src/renderer/tree/dom.js";
import { listenersOf } from "#src/renderer/tree/tree.js";
import { flush } from "#src/scheduling.js";
import { isMotionReducedBySystem } from "#src/window/reduced-motion.js";

// The Web Animations a stock Svelte asks its elements for, on WinUI's
// controls. Svelte's `transition:`, `in:`, `out:` and `animate:` call
// `element.animate(keyframes, options)` and read `getComputedStyle`,
// `getBoundingClientRect` and `inert`; its `tweened`, `spring` and
// `tick` loops ask for `requestAnimationFrame`. `enableElementAnimation`
// gives the tree's elements and the global scope those, over the control's
// Opacity, Translation, Scale, Rotation, size, margin, padding, border and
// stroke dashes, stepped on a clock (a dispatcher timer in a window). The
// transition functions (fade, fly, slide, scale, draw, crossfade, flip or
// your own) and their timing are Svelte's own: this is only what they draw
// on. The Vite plugin calls it from a component that uses them, so an app
// that does not never bundles any of it.

const NO_TRANSFORM = "none";
const GET_COMPUTED_STYLE = "getComputedStyle";
const REQUEST_FRAME = "requestAnimationFrame";
const CANCEL_FRAME = "cancelAnimationFrame";
const DASH_ARRAY_PROPERTY = "strokeDashArray";
const DEFAULT_ORIGIN = 0.5;
const STATIC_POSITION = "static";
const ABSOLUTE_POSITION = "absolute";
// WinUI's Orientation.Horizontal; Vertical is 0.
const HORIZONTAL_ORIENTATION = 1;
const TRANSITION_EVENTS = new Set(["introstart", "introend", "outrostart", "outroend"]);

// The sides along a panel's main axis: a leaving element gives back the room
// it takes there (its trailing margin is made as negative as its size and
// leading margin are positive), so the panel lays out as without it.
const FLOW_AXES = {
  vertical: {
    leading: "top",
    trailing: PoseField.MARGIN_BOTTOM,
    size: "y"
  },
  horizontal: {
    leading: "left",
    trailing: PoseField.MARGIN_RIGHT,
    size: "x"
  }
} as const;

/** The states of an animation. */
export const PlayState = {
  IDLE: "idle",
  RUNNING: "running",
  PAUSED: "paused",
  FINISHED: "finished"
} as const;

/** One of the values of `PlayState`. */
export type PlayState = typeof PlayState[keyof typeof PlayState];

/** What `enableElementAnimation` can be told. */
export interface ElementAnimationOptions {
  /** Default: the UI thread's dispatcher timer, about every 16 milliseconds. */
  clock?: AnimationClock;

  /** Runs after each frame; default: Svelte's flush, for state a transition's `tick` changed. */
  onFrame?: () => void;

  /** Hears of the keyframe properties WinUI cannot animate, once for each; default: console.warn. */
  warn?: (message: string) => void;

  /**
   * Whether the user asked for reduced motion, which makes every animation of
   * an element without the `winui-motion-always` class skip to its end; default:
   * Windows' animation effects are off.
   */
  isMotionReduced?: () => boolean;

  /** Makes the value a shape's `strokeDashArray` takes from lengths; default: a `DoubleCollection`. */
  createDashes?: (lengths: number[]) => object;

  /**
   * Draws a control through a blur of that standard deviation, or with none for null: what a
   * `filter: blur()` keyframe (Svelte's `blur` transition) asks. Default: the one
   * `provideElementBlur` was given (`winui-svelte/element-effects`), else a blur only fades.
   */
  setBlur?: (input: {
    control: object;
    radius: number | null;
  }) => void;
}

/** The function that draws a control through a blur, or with none. */
export type BlurSetter = NonNullable<ElementAnimationOptions["setBlur"]>;

interface EngineOptions extends Required<Omit<ElementAnimationOptions, "setBlur">> {
  setBlur: BlurSetter | undefined;
}

// What the opt-in modules gave: the engine asks when it animates, so a module that loads after it still counts.
const provided: { blur: BlurSetter | null } = { blur: null };

/**
 * Tells the animations how to draw a blur, which `winui-svelte/element-effects` does with
 * Composition and Win2D: with it, `filter: blur()` keyframes (Svelte's `blur`) blur the control.
 */
export function provideElementBlur(setBlur: BlurSetter) {
  provided.blur = setBlur;
}

/**
 * The animation `element.animate()` gives back: a clock-driven handle over the
 * control's properties. `winui-svelte/web-apis/animations` wraps it in the web's
 * `Animation`.
 */
export interface ElementAnimationHandle {
  onfinish: (() => void) | null;
  oncancel: (() => void) | null;
  readonly playState: PlayState;
  currentTime: number | null;
  playbackRate: number;
  readonly timing: EffectTiming;
  play(): void;
  pause(): void;
  finish(): void;
  cancel(): void;
  reverse(): void;
  updateTiming(input: EffectTimingInput): void;
}

type AnimateOptions = EffectTimingInput;

interface Point {
  x: number;
  y: number;
}

interface MotionControl {
  opacity: number;
  centerPoint: Vector;
  isHitTestVisible: boolean;
  readonly actualSize: Point;
}

interface MotionNode {
  readonly name: string;
  readonly native: { readonly control: object | null };
  readonly parent: {
    readonly native?: { readonly control: object | null };
  } | null;
}

interface Target {
  readonly control: MotionControl;
  readonly createDashes: (lengths: number[]) => object;
  readonly setBlur: BlurSetter;
}

// How a field is read from a control, and written back to it.
interface FieldAccess {
  read(control: MotionControl): PoseValue | undefined;
  write(options: {
    target: Target;
    value: PoseValue;
  }): void;
}

interface Layer {
  readonly fields: ReadonlySet<string>;
  // Null for a layer that holds a pose still (a leaving element's margin) and is no animation.
  readonly animation: ElementAnimationHandle | null;
  pose: Pose;
}

interface MotionState {
  readonly node: MotionNode;
  readonly createDashes: (lengths: number[]) => object;
  readonly setBlur: BlurSetter;
  // In the order the animations were made: a later one wins a field.
  readonly layers: Layer[];
  // What the control held before the first animation of each field began.
  base: Pose;
  baseCenter: Vector | null;
  isInert: boolean;
  isHitTestVisibleBefore: boolean;
  // The margin that gives a leaving element's room back to its panel, while it leaves.
  flowLayer: Layer | null;
  // What `style.position` was last set to, which Svelte's `animate:` uses to take an element out of the flow.
  stylePosition: string;
}

function isMotionControl(value: NativeValue): value is MotionControl {
  return isRecord(value) && typeof read(value, "opacity") === "number" && read(value, "actualSize") !== undefined;
}

function isMotionNode(value: NativeValue): value is MotionNode {
  return isRecord(value) && isRecord(read(value, "native"));
}

function isCallable(value: NativeValue): value is (...values: NativeValue[]) => NativeValue {
  return typeof value === "function";
}

function isVector(value: NativeValue): value is Vector {
  return isRecord(value) && typeof value["x"] === "number" && typeof value["y"] === "number" && typeof value["z"] === "number";
}

// Entries of a pose filtered by field are a pose; fromEntries loses that.
function isPose(_value: object): _value is Pose {
  return true;
}

function copyVector(vector: Vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function numberOf(value: NativeValue) {
  return typeof value === "number" ? value : undefined;
}

function numberAccess(property: string) {
  return {
    read: control => numberOf(read(control, property)),
    write({ target, value }) {
      const isNumber = typeof value === "number";
      if (isNumber) {
        write(target.control, property, value);
      }
    }
  } satisfies FieldAccess;
}

function vectorAccess(property: string) {
  return {
    read(control) {
      const value = read(control, property);
      return isVector(value) ? copyVector(value) : undefined;
    },
    write({ target, value }) {
      const isVectorValue = typeof value === "object";
      if (isVectorValue) {
        write(target.control, property, copyVector(value));
      }
    }
  } satisfies FieldAccess;
}

const SIDES = ["left", "top", "right", "bottom"] as const;

type Side = typeof SIDES[number];

// A Thickness (Margin, Padding, BorderThickness) holds the four sides; a field is one of them.
function sideAccess({ property, side }: {
  property: string;
  side: Side;
}) {
  return {
    read: control => numberOf(read(read(control, property), side)),
    write({ target, value }) {
      const current = read(target.control, property);
      const isWritable = isRecord(current) && typeof value === "number";
      if (!isWritable) {
        return;
      }

      write(target.control, property, Object.fromEntries(SIDES.map(key => [key, key === side ? value : current[key]])));
    }
  } satisfies FieldAccess;
}

// A stroke's dashes are in multiples of its thickness in WinUI, pixels in CSS.
function strokeThicknessOf(control: MotionControl) {
  const thickness = numberOf(read(control, "strokeThickness"));
  const isMeasurable = thickness !== undefined && thickness > 0;
  return isMeasurable ? thickness : undefined;
}

const NO_DASH = {
  x: 0,
  y: 0,
  z: 0
};

const dashAccess = {
  read: control => strokeThicknessOf(control) === undefined ? undefined : NO_DASH,
  write({ target, value }) {
    const thickness = strokeThicknessOf(target.control);
    const isDash = typeof value === "object" && thickness !== undefined;
    if (!isDash) {
      return;
    }

    const isSolid = value.x === 0 && value.y === 0;
    const dashes = isSolid ? null : target.createDashes([value.x / thickness, value.y / thickness]);
    write(target.control, DASH_ARRAY_PROPERTY, dashes);
  }
} satisfies FieldAccess;

const dashOffsetAccess = {
  read(control) {
    const thickness = strokeThicknessOf(control);
    const offset = numberOf(read(control, "strokeDashOffset"));
    const isMeasurable = thickness !== undefined && offset !== undefined;
    return isMeasurable ? offset * thickness : undefined;
  },
  write({ target, value }) {
    const thickness = strokeThicknessOf(target.control);
    const isOffset = typeof value === "number" && thickness !== undefined;
    if (isOffset) {
      write(target.control, "strokeDashOffset", value / thickness);
    }
  }
} satisfies FieldAccess;

// A blur is drawn by the effects (winui-svelte/element-effects), not read from the control: it starts at none.
const blurAccess = {
  read: () => 0,
  write({ target, value }) {
    const isRadius = typeof value === "number";
    if (isRadius) {
      target.setBlur({
        control: target.control,
        radius: value > 0 ? value : null
      });
    }
  }
} satisfies FieldAccess;

function capitalized(word: string) {
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`;
}

// The pose fields of a Thickness, by the CSS prefix of their names.
function sideAccesses({ property, prefix }: {
  property: string;
  prefix: string;
}) {
  return SIDES.map(side => [`${prefix}${capitalized(side)}`, sideAccess({
    property,
    side
  })] satisfies [string, FieldAccess]);
}

// A field with no entry (the origin) is not written to the control itself.
const fieldAccesses = new Map<string, FieldAccess>([
  [PoseField.OPACITY, numberAccess("opacity")],
  [PoseField.TRANSLATION, vectorAccess("translation")],
  [PoseField.SCALE, vectorAccess("scale")],
  [PoseField.ROTATION, numberAccess("rotation")],
  [PoseField.WIDTH, numberAccess("width")],
  [PoseField.HEIGHT, numberAccess("height")],
  [PoseField.STROKE_DASH, dashAccess],
  [PoseField.STROKE_DASH_OFFSET, dashOffsetAccess],
  [PoseField.BLUR, blurAccess],
  ...sideAccesses({
    property: "margin",
    prefix: "margin"
  }),
  ...sideAccesses({
    property: "padding",
    prefix: "padding"
  }),
  ...sideAccesses({
    property: "borderThickness",
    prefix: "border"
  })
]);

function controlOf(state: MotionState) {
  const control = state.node.native.control;
  return isMotionControl(control) ? control : null;
}

function filterPose({ pose, isKept }: {
  pose: Pose;
  isKept: (field: string) => boolean;
}) {
  const kept = Object.fromEntries(Object.entries(pose).filter(([field]) => isKept(field)));
  return isPose(kept) ? kept : {};
}

// What the control holds now of these fields (those it has).
function poseOf({ control, fields }: {
  control: MotionControl;
  fields: ReadonlySet<string>;
}) {
  const entries = [...fields].flatMap(field => {
    const value = fieldAccesses.get(field)?.read(control);
    return value === undefined ? [] : [[field, value]];
  });
  const pose = Object.fromEntries(entries);
  return isPose(pose) ? pose : {};
}

function writePose({ target, pose }: {
  target: Target;
  pose: Pose;
}) {
  for (const [field, value] of Object.entries(pose)) {
    const isSet = value !== undefined;
    if (isSet) {
      fieldAccesses.get(field)?.write({
        target,
        value
      });
    }
  }
}

function touchedBy(layers: Layer[]) {
  const fields = new Set<string>();
  for (const layer of layers) {
    for (const field of layer.fields) {
      fields.add(field);
    }
  }

  return fields;
}

function isCentering(fields: ReadonlySet<string>) {
  return fields.has(PoseField.SCALE) || fields.has(PoseField.ROTATION);
}

// WinUI scales and rotates about the CenterPoint (the corner, by default),
// CSS about the transform origin (the middle, by default).
function centerOf({ control, origin }: {
  control: MotionControl;
  origin: PoseValue | undefined;
}) {
  const fraction = typeof origin === "object" ? origin : {
    x: DEFAULT_ORIGIN,
    y: DEFAULT_ORIGIN
  };
  return {
    x: control.actualSize.x * fraction.x,
    y: control.actualSize.y * fraction.y,
    z: 0
  };
}

function addLayer({ state, layer }: {
  state: MotionState;
  layer: Layer;
}) {
  const control = controlOf(state);
  const isControlMade = control !== null;
  if (isControlMade) {
    const held = touchedBy(state.layers);
    Object.assign(
      state.base, poseOf({
        control,
        fields: new Set([...layer.fields].filter(field => !held.has(field) && !(field in state.base)))
      })
    );
    const isCenterFree = state.baseCenter === null && isCentering(layer.fields);
    if (isCenterFree) {
      state.baseCenter = copyVector(control.centerPoint);
    }
  }

  state.layers.push(layer);
}

// The control shows what the newest animation of each field says, and what
// it held before the first one for a field no animation names any more.
function render(state: MotionState) {
  const control = controlOf(state);
  const isControlGone = control === null;
  if (isControlGone) {
    return;
  }

  const shown: Pose = { ...state.base };
  for (const layer of state.layers) {
    Object.assign(shown, layer.pose);
  }

  writePose({
    target: {
      control,
      createDashes: state.createDashes,
      setBlur: state.setBlur
    },
    pose: shown
  });
  const touched = touchedBy(state.layers);
  state.base = filterPose({
    pose: state.base,
    isKept: field => touched.has(field)
  });

  if (isCentering(touched)) {
    control.centerPoint = centerOf({
      control,
      origin: shown.origin
    });
    return;
  }

  const { baseCenter } = state;
  const isCenterMoved = baseCenter !== null;
  if (isCenterMoved) {
    control.centerPoint = baseCenter;
    state.baseCenter = null;
  }
}

// Svelte cancels an animation just before it makes the next one: with none
// left, the control gets what it held only at the end of the frame, if no
// animation has come by then, so it never flashes its own values in between.
function removeLayer({ state, layer, restoreLater }: {
  state: MotionState;
  layer: Layer;
  restoreLater: (state: MotionState) => void;
}) {
  const iLayer = state.layers.indexOf(layer);
  const isLayered = iLayer >= 0;
  if (!isLayered) {
    return;
  }

  state.layers.splice(iLayer, 1);

  const isEmptied = state.layers.length === 0;
  if (isEmptied) {
    restoreLater(state);
    return;
  }

  render(state);
}

// The CSS property of each side of a box, and the Thickness and side that hold it.
const BOX_STYLES = SIDES.flatMap(side => [
  [`margin${capitalized(side)}`, "margin", side],
  [`padding${capitalized(side)}`, "padding", side],
  [`border${capitalized(side)}Width`, "borderThickness", side]
] satisfies Array<[string, string, Side]>);

// What the page reads of a control's box, in pixels, as the CSS property says it.
function boxStyleOf(control: MotionControl) {
  return Object.fromEntries(BOX_STYLES.map(([name, property, side]) => [name, `${numberOf(read(read(control, property), side)) ?? 0}px`]));
}

// A reading with the blur taken out, and `filter` named unsupported when it had one.
function withoutBlur(reading: ReturnType<typeof readKeyframe>) {
  const isBlurred = PoseField.BLUR in reading.pose;
  if (!isBlurred) {
    return reading;
  }

  return {
    pose: filterPose({
      pose: reading.pose,
      isKept: field => field !== PoseField.BLUR
    }),
    unsupported: [...reading.unsupported, "filter"]
  };
}

// The keyframes' own time runs on the engine's clock; the engine steps what
// is running on each frame, and stops the clock when nothing is.
function createEngine({ clock, onFrame, warn, createDashes, isMotionReduced, setBlur }: EngineOptions) {
  const states = new WeakMap<object, MotionState>();
  const steps = new Set<(now: number) => void>();
  const frameCallbacks = new Map<number, (time: number) => void>();
  const warned = new Set<string>();
  const pendingRestores = new Set<MotionState>();
  let stopClock: (() => void) | null = null;
  let lastFrameId = 0;

  function frame() {
    const now = clock.now();
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    for (const callback of callbacks) {
      callback(now);
    }

    for (const step of steps) {
      step(now);
    }

    for (const state of pendingRestores) {
      render(state);
    }

    pendingRestores.clear();
    onFrame();
    const isIdle = steps.size === 0 && frameCallbacks.size === 0 && pendingRestores.size === 0;
    if (isIdle) {
      stopClock?.();
      stopClock = null;
    }
  }

  function ensureClock() {
    stopClock ??= clock.every(frame);
  }

  function restoreLater(state: MotionState) {
    pendingRestores.add(state);
    ensureClock();
  }

  function requestFrame(callback: (time: number) => void) {
    lastFrameId++;
    frameCallbacks.set(lastFrameId, callback);
    ensureClock();
    return lastFrameId;
  }

  function stateFor(node: MotionNode) {
    const existing = states.get(node);
    const isKnown = existing !== undefined;
    if (isKnown) {
      return existing;
    }

    const created: MotionState = {
      node,
      createDashes,
      setBlur: input => (setBlur ?? provided.blur)?.(input),
      layers: [],
      base: {},
      baseCenter: null,
      isInert: false,
      isHitTestVisibleBefore: true,
      flowLayer: null,
      stylePosition: ""
    };
    states.set(node, created);
    return created;
  }

  function warnOnce(properties: string[]) {
    const fresh = properties.filter(property => !warned.has(property));
    const isNothingNew = fresh.length === 0;
    if (isNothingNew) {
      return;
    }

    for (const property of fresh) {
      warned.add(property);
    }

    warn(`${fresh.join(", ")} cannot be animated on a WinUI control (opacity, translate, scale, rotate, transform with translate, scale and rotate, the size, margin, padding and border of a side, a shape's dashes and, with winui-svelte/element-effects, filter: blur() can); ignored`);
  }

  function animate({ node, keyframes, options }: {
    node: MotionNode;
    keyframes: Keyframe[];
    options: AnimateOptions;
  }) {
    const state = stateFor(node);
    const isBlurDrawn = (setBlur ?? provided.blur) !== null;
    const readings = keyframes.map(keyframe => {
      const reading = readKeyframe(keyframe);
      return isBlurDrawn ? reading : withoutBlur(reading);
    });
    warnOnce(readings.flatMap(reading => reading.unsupported));
    const poses = readings.map(reading => reading.pose);
    const isSkipped = isMotionReduced() && !keepsMotion(node);
    function resolve(input: AnimateOptions) {
      const resolved = resolveTiming(input);
      return isSkipped ? {
        ...resolved,
        duration: 0,
        delay: 0,
        endDelay: 0
      } : resolved;
    }

    let timing = resolve(options);
    let playState: PlayState = PlayState.IDLE;
    let rate = 1;
    // The animation's time while it is paused or finished; running, it is the anchor plus what the clock has moved.
    let held: number | null = null;
    let anchorTime = 0;
    let anchorAt = 0;

    function timeNow() {
      return held ?? anchorTime + (clock.now() - anchorAt) * rate;
    }

    function isAtEnd(time: number) {
      return rate > 0 ? time >= endTime(timing) : rate < 0 && time <= 0;
    }

    function show(time: number) {
      const progress = progressAt({
        timing,
        time
      });
      layer.pose = progress === null ? {} : poseAt({
        poses,
        progress
      });
      render(state);
    }

    function run(time: number) {
      held = null;
      anchorTime = time;
      anchorAt = clock.now();
      playState = PlayState.RUNNING;
      const isLayered = state.layers.includes(layer);
      if (!isLayered) {
        addLayer({
          state,
          layer
        });
      }

      steps.add(step);
      ensureClock();
      show(time);
    }

    function hold({ time, next }: {
      time: number;
      next: PlayState;
    }) {
      held = time;
      playState = next;
      steps.delete(step);
      const isActive = progressAt({
        timing,
        time
      }) !== null;
      if (isActive) {
        show(time);
        return;
      }

      removeLayer({
        state,
        layer,
        restoreLater
      });
    }

    function settle() {
      hold({
        time: rate > 0 ? endTime(timing) : 0,
        next: PlayState.FINISHED
      });
      animation.onfinish?.();
    }

    function step() {
      const time = timeNow();
      const isDone = isAtEnd(time);
      if (isDone) {
        settle();
        return;
      }

      show(time);
    }

    function startTime() {
      return rate < 0 ? endTime(timing) : 0;
    }

    function playFrom(time: number) {
      const isRestart = isAtEnd(time);
      run(isRestart ? startTime() : time);
    }

    const animation: ElementAnimationHandle = {
      onfinish: null,
      oncancel: null,
      get playState() {
        return playState;
      },
      get currentTime() {
        return playState === PlayState.IDLE ? null : timeNow();
      },
      set currentTime(time: number | null) {
        const isUnset = time === null || playState === PlayState.IDLE;
        if (isUnset) {
          return;
        }

        const isRunning = playState === PlayState.RUNNING;
        if (isRunning) {
          run(time);
          return;
        }

        hold({
          time,
          next: PlayState.PAUSED
        });
      },
      get playbackRate() {
        return rate;
      },
      set playbackRate(next: number) {
        const isRunning = playState === PlayState.RUNNING;
        if (isRunning) {
          anchorTime = timeNow();
          anchorAt = clock.now();
        }

        rate = next;
      },
      get timing() {
        return timing;
      },
      play() {
        const isRunning = playState === PlayState.RUNNING && !isAtEnd(timeNow());
        if (isRunning) {
          return;
        }

        playFrom(playState === PlayState.IDLE ? startTime() : held ?? timeNow());
      },
      pause() {
        const isIdle = playState === PlayState.IDLE;
        const isPaused = playState === PlayState.PAUSED;
        if (isPaused) {
          return;
        }

        if (isIdle) {
          run(startTime());
        }

        hold({
          time: timeNow(),
          next: PlayState.PAUSED
        });
      },
      finish() {
        const isIdle = playState === PlayState.IDLE;
        const isFinished = playState === PlayState.FINISHED;
        const isStuck = rate === 0 || isIdle || isFinished;
        if (isStuck) {
          return;
        }

        settle();
      },
      cancel() {
        const isIdle = playState === PlayState.IDLE;
        if (isIdle) {
          return;
        }

        playState = PlayState.IDLE;
        held = null;
        steps.delete(step);
        removeLayer({
          state,
          layer,
          restoreLater
        });
        animation.oncancel?.();
      },
      reverse() {
        animation.playbackRate = -rate;
        animation.play();
      },
      updateTiming(input) {
        timing = resolve({
          ...timing,
          ...input
        });
        const isShown = playState !== PlayState.IDLE;
        if (isShown) {
          show(timeNow());
        }
      }
    };
    const layer: Layer = {
      fields: touchedFields(poses),
      animation,
      pose: {}
    };

    animation.play();
    return animation;
  }

  function animations(node: MotionNode) {
    return stateFor(node).layers.flatMap(layer => layer.animation === null ? [] : [layer.animation]);
  }

  // The axis a panel lays its children out along, when it has one (a StackPanel).
  function flowAxisOf(node: MotionNode) {
    const orientation = numberOf(read(node.parent?.native?.control, "orientation"));
    const isVertical = orientation === undefined;
    if (isVertical) {
      return null;
    }

    return orientation === HORIZONTAL_ORIENTATION ? FLOW_AXES.horizontal : FLOW_AXES.vertical;
  }

  // Svelte's `animate:` takes a leaving element out of the flow, so the
  // elements around it move into place while it fades (WinUI has no absolute
  // position outside a Canvas): its slot along the panel's axis shrinks to
  // nothing, and it stays drawn where it is.
  function leaveFlow(node: MotionNode) {
    const state = stateFor(node);
    const control = controlOf(state);
    const axis = flowAxisOf(node);
    const isMovable = control !== null && axis !== null && state.flowLayer === null;
    if (!isMovable) {
      return;
    }

    const leading = numberOf(read(read(control, "margin"), axis.leading)) ?? 0;
    const layer: Layer = {
      fields: new Set([axis.trailing]),
      animation: null,
      pose: {
        [axis.trailing]: -(control.actualSize[axis.size] + leading)
      }
    };
    addLayer({
      state,
      layer
    });
    state.flowLayer = layer;
    render(state);
  }

  function rejoinFlow(node: MotionNode) {
    const state = stateFor(node);
    const { flowLayer } = state;
    const isLeaving = flowLayer === null;
    if (isLeaving) {
      return;
    }

    state.flowLayer = null;
    removeLayer({
      state,
      layer: flowLayer,
      restoreLater
    });
    render(state);
  }

  // The element's `style`, with a `position` that takes it out of the flow, and back.
  function styleOf({ node, base }: {
    node: MotionNode;
    base: object;
  }) {
    const state = stateFor(node);
    const style = Object.create(base);
    Object.defineProperty(style, "position", {
      get: () => state.stylePosition,
      set(position: string) {
        state.stylePosition = position;

        const isOutOfFlow = position === ABSOLUTE_POSITION;
        if (isOutOfFlow) {
          leaveFlow(node);
          return;
        }

        rejoinFlow(node);
      }
    });
    return style;
  }

  // A leaving element takes no input, as an inert one in the browser.
  function setInert({ node, isInert }: {
    node: MotionNode;
    isInert: boolean;
  }) {
    const state = stateFor(node);
    const control = controlOf(state);
    const isChange = control !== null && state.isInert !== isInert;
    if (!isChange) {
      return;
    }

    state.isInert = isInert;

    if (isInert) {
      state.isHitTestVisibleBefore = control.isHitTestVisible;
      control.isHitTestVisible = false;
      return;
    }

    control.isHitTestVisible = state.isHitTestVisibleBefore;
  }

  function isInert(node: MotionNode) {
    return stateFor(node).isInert;
  }

  function computedStyle(node: MotionNode) {
    const state = stateFor(node);
    const control = controlOf(state);
    const isInFlow = state.flowLayer === null && flowAxisOf(node) !== null;
    const size = control?.actualSize ?? {
      x: 0,
      y: 0
    };
    const thickness = control === null ? undefined : strokeThicknessOf(control);
    return {
      opacity: String(control?.opacity ?? 1),
      transform: NO_TRANSFORM,
      transformOrigin: `${size.x / 2}px ${size.y / 2}px`,
      filter: NO_TRANSFORM,
      display: "block",
      // Svelte's `animate:` takes an element it finds in the flow out of it
      // (see leaveFlow); one WinUI cannot (outside a StackPanel) is told it already is.
      position: isInFlow ? STATIC_POSITION : ABSOLUTE_POSITION,
      width: `${size.x}px`,
      height: `${size.y}px`,
      strokeWidth: `${thickness ?? 0}px`,
      strokeLinecap: "butt",
      ...control === null ? {} : boxStyleOf(control)
    };
  }

  // Where the control is in the window, as the page's getBoundingClientRect says it.
  function boundingRect(node: MotionNode) {
    const control = controlOf(stateFor(node));
    const hasLayout = control !== null && isCallable(read(control, "transformToVisual"));
    const origin = hasLayout ? layoutOrigin(control) : {
      x: 0,
      y: 0
    };
    const width = control?.actualSize.x ?? 0;
    const height = control?.actualSize.y ?? 0;
    return {
      x: origin.x,
      y: origin.y,
      left: origin.x,
      top: origin.y,
      right: origin.x + width,
      bottom: origin.y + height,
      width,
      height
    };
  }

  function layoutOrigin(control: MotionControl) {
    const updateLayout = read(control, "updateLayout");
    if (isCallable(updateLayout)) {
      updateLayout.call(control);
    }

    const transform = read(control, "transformToVisual");
    const toWindow = isCallable(transform) ? transform.call(control, null) : null;
    const transformPoint = read(toWindow, "transformPoint");
    const point = isCallable(transformPoint) ? transformPoint.call(toWindow, {
      x: 0,
      y: 0
    }) : null;
    return {
      x: numberOf(read(point, "x")) ?? 0,
      y: numberOf(read(point, "y")) ?? 0
    };
  }

  function totalLength(node: MotionNode) {
    return shapeLength({
      name: node.name,
      control: node.native.control
    });
  }

  return {
    animate,
    animations,
    isInert,
    setInert,
    computedStyle,
    boundingRect,
    totalLength,
    styleOf,
    requestFrame,
    cancelFrame: (id: number) => frameCallbacks.delete(id)
  };
}

let disableCurrent: (() => void) | null = null;

// Defines `name` on `target` and returns what puts it back as it was.
function define({ target, name, descriptor }: {
  target: object;
  name: string;
  descriptor: PropertyDescriptor;
}) {
  const previous = Object.getOwnPropertyDescriptor(target, name);
  Object.defineProperty(target, name, {
    configurable: true,
    ...descriptor
  });
  return () => {
    if (previous) {
      Object.defineProperty(target, name, previous);
      return;
    }

    Object.defineProperty(target, name, {
      value: undefined,
      configurable: true
    });
  };
}

// What the engine gives an element the way the DOM does: methods that use `this`.
function elementMembers({ engine, original }: {
  engine: ReturnType<typeof createEngine>;
  original: {
    style: (() => object) | undefined;
    addEventListener: ElementNode<unknown>["addEventListener"];
    removeEventListener: ElementNode<unknown>["removeEventListener"];
  };
}) {
  return {
    animate: {
      value(this: MotionNode, keyframes: Keyframe[], options: AnimateOptions | number = {}) {
        return engine.animate({
          node: this,
          keyframes,
          options: typeof options === "number" ? {
            duration: options
          } : options
        });
      }
    },
    getAnimations: {
      value(this: MotionNode) {
        return engine.animations(this);
      }
    },
    getBoundingClientRect: {
      value(this: MotionNode) {
        return engine.boundingRect(this);
      }
    },
    clientWidth: {
      get(this: MotionNode) {
        return engine.boundingRect(this).width;
      }
    },
    clientHeight: {
      get(this: MotionNode) {
        return engine.boundingRect(this).height;
      }
    },
    // The browser's page zoom, which `animate:` divides by.
    currentCSSZoom: {
      value: 1
    },
    getTotalLength: {
      value(this: MotionNode) {
        return engine.totalLength(this);
      }
    },
    style: {
      get(this: MotionNode) {
        return engine.styleOf({
          node: this,
          base: original.style?.call(this) ?? {}
        });
      }
    },
    // `introstart` and the like are Svelte's, not WinUI's events: a handler
    // for one is held by the element and never given to the control.
    addEventListener: {
      value(this: ElementNode<unknown>, type?: string, handler?: NativeValue) {
        const isLifecycle = type !== undefined && TRANSITION_EVENTS.has(type);
        if (!isLifecycle) {
          original.addEventListener.call(this, type, handler);
          return;
        }

        listenersOf({
          element: this,
          type
        }).set(handler, () => {});
      }
    },
    removeEventListener: {
      value(this: ElementNode<unknown>, type?: string, handler?: NativeValue) {
        const isLifecycle = type !== undefined && TRANSITION_EVENTS.has(type);
        if (!isLifecycle) {
          original.removeEventListener.call(this, type, handler);
          return;
        }

        this.listeners.get(type)?.delete(handler);
      }
    },
    // Svelte announces them with `dispatchEvent`; only handlers the element
    // holds for the type are called.
    dispatchEvent: {
      value(this: ElementNode<unknown>, event: { type: string }) {
        for (const handler of this.listeners.get(event.type)?.keys() ?? []) {
          const isHandler = isCallable(handler);
          if (isHandler) {
            handler.call(this, event);
          }
        }

        return true;
      }
    },
    inert: {
      get(this: MotionNode) {
        return engine.isInert(this);
      },
      set(this: MotionNode, isInert: boolean) {
        engine.setInert({
          node: this,
          isInert
        });
      }
    }
  } satisfies PropertyDescriptorMap;
}

/**
 * Turns on what Svelte's transitions need of a WinUI element: `animate()`,
 * `getAnimations()`, `getBoundingClientRect()`, `getTotalLength()` (for
 * `draw`) and `inert` on the tree's elements, and on the global scope
 * `getComputedStyle` (which answers for WinUI's elements and passes any other
 * to the one there was, if any), `requestAnimationFrame` and
 * `cancelAnimationFrame` (for `tweened`, `spring` and a transition's `tick`).
 * The Vite plugin calls it from every component that uses a `transition:`,
 * `in:`, `out:` or `animate:` directive or imports `svelte/transition`,
 * `svelte/animate` or `svelte/motion`; call it yourself only to give another
 * clock (a test) or when you do not use the plugin. Calling it again with no
 * options keeps what is on. An app that never imports this module does not
 * bundle any of it.
 *
 * @param options - The clock, to step by something other than the UI thread's timer, and what to do after a frame.
 * @returns A function that turns it off again.
 */
export function enableElementAnimation(options?: ElementAnimationOptions) {
  const current = disableCurrent;
  const isAlreadyOn = options === undefined && current !== null;
  if (isAlreadyOn) {
    return current;
  }

  current?.();
  const engine = createEngine({
    clock: options?.clock ?? dispatcherClock,
    onFrame: options?.onFrame ?? flush,
    warn: options?.warn ?? (message => console.warn(message)),
    createDashes: options?.createDashes ?? doubleCollection,
    isMotionReduced: options?.isMotionReduced ?? isMotionReducedBySystem,
    setBlur: options?.setBlur
  });

  const previousComputedStyle = read(globalThis, GET_COMPUTED_STYLE);
  function computedStyleOf(node: NativeValue, ...rest: NativeValue[]) {
    if (isMotionNode(node)) {
      return engine.computedStyle(node);
    }

    if (!isCallable(previousComputedStyle)) {
      throw new TypeError("getComputedStyle was given something that is not a WinUI element ");
    }

    return previousComputedStyle.call(globalThis, node, ...rest);
  }

  const { prototype } = ElementNode;
  const members = elementMembers({
    engine,
    original: {
      style: Object.getOwnPropertyDescriptor(prototype, "style")?.get,
      addEventListener: prototype.addEventListener,
      removeEventListener: prototype.removeEventListener
    }
  });
  const undo = [
    ...Object.entries(members).map(([name, descriptor]) => define({
      target: ElementNode.prototype,
      name,
      descriptor
    })),
    define({
      target: globalThis,
      name: GET_COMPUTED_STYLE,
      descriptor: {
        value: computedStyleOf
      }
    }),
    define({
      target: globalThis,
      name: REQUEST_FRAME,
      descriptor: {
        value: engine.requestFrame
      }
    }),
    define({
      target: globalThis,
      name: CANCEL_FRAME,
      descriptor: {
        value: engine.cancelFrame
      }
    })
  ];

  function disable() {
    for (const restore of undo) {
      restore();
    }

    disableCurrent = null;
  }

  disableCurrent = disable;
  return disable;
}
