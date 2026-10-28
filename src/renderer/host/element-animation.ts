import renderer from "./host.ts";
import type { Keyframe, Pose, Vector } from "./keyframes.ts";
import {
  poseAt,
  PoseField,
  readDeclarations,
  readKeyframe,
  touchedFields
} from "./keyframes.ts";
import { isRecord, read, write } from "./reflect.ts";
import type { NativeValue } from "#src/native-value.js";
import { parentElement } from "#src/renderer/tree/tree.js";
import { flush } from "#src/scheduling.js";
import { startTimer } from "#src/window/timers.js";
import type { TransitionConfig } from "svelte/transition";

// Transitions for WinUI's controls. Svelte's own `transition:`, `in:`, `out:`
// and `animate:` do not compile on a custom renderer (the compiler refuses
// them: they drive the DOM's Element.animate()), so the same transition
// functions (svelte/transition's fade, fly, scale, or one of your own) are
// played by attachments instead: `{@attach transition(fade, { duration: 200 })}`.
// What a transition's `css(t, u)` says is read into the control's Opacity,
// Translation, Scale and Rotation, stepped on a clock (a dispatcher timer in
// a window). Svelte removes an element the moment its block goes, so a leaving
// element is kept in its parent until its outro has run: the renderer's
// `remove` waits for it.

const FRAME_MILLISECONDS = 16;
const FRAMES_PER_SECOND = 60;
const MILLISECONDS_PER_SECOND = 1000;
const NO_TRANSFORM = "none";
const NO_LENGTH = "0px";
const GET_COMPUTED_STYLE = "getComputedStyle";
const DIRECTION_IN = "in";
const DIRECTION_OUT = "out";

const Fill = {
  FORWARDS: "forwards",
  BOTH: "both"
} as const;

const PlayState = {
  IDLE: "idle",
  RUNNING: "running",
  FINISHED: "finished"
} as const;

type PlayState = typeof PlayState[keyof typeof PlayState];

const keptFills = new Set<string>(Object.values(Fill));

/** What drives the animations: a time that only moves forward, and a ticking frame. */
export interface AnimationClock {
  /** Milliseconds on a clock that only moves forward. */
  now(): number;

  /** Calls `onFrame` about every frame until the returned function is called. */
  every(onFrame: () => void): () => void;
}

/** What `enableElementAnimation` can be told. */
export interface ElementAnimationOptions {
  /** Default: the UI thread's dispatcher timer, about every 16 milliseconds. */
  clock?: AnimationClock;

  /** Runs after each frame; default: Svelte's flush, for state a transition's `tick` changed. */
  onFrame?: () => void;

  /** Hears of the keyframe properties WinUI cannot animate, once for each; default: console.warn. */
  warn?: (message: string) => void;
}

/** What a transition function is given besides the element and its parameters. */
export interface TransitionOptions {
  direction: "in" | "out" | "both";
}

/**
 * A transition function, as Svelte's are: svelte/transition's `fade`, `fly`,
 * `scale` and `blur`, `slide` (its opacity only), or your own, returning what
 * `css(t, u)` and `tick(t, u)` say at each point from 0 to 1.
 */
export type TransitionFunction<Params> = (
  node: never,
  params: Params,
  options: TransitionOptions
) => TransitionConfig | ((options: TransitionOptions) => TransitionConfig);

type LeavingNode = Parameters<typeof renderer.remove>[0];

interface Handle {
  onfinish: (() => void) | null;
  readonly playState: PlayState;
  readonly currentTime: number | null;
  cancel(): void;
}

interface Run {
  progress(): number;
  abort(): void;
}

interface AnimateOptions {
  duration: number;
  fill: string;
}

interface Point {
  x: number;
  y: number;
}

interface MotionControl {
  opacity: number;
  translation: Vector;
  scale: Vector;
  rotation: number;
  centerPoint: Vector;
  isHitTestVisible: boolean;
  readonly actualSize: Point;
}

interface MotionNode {
  readonly native: { readonly control: object | null };
}

interface Layer {
  readonly fields: ReadonlySet<string>;
  readonly animation: Handle;
  pose: Pose;
}

type Callable = (...values: NativeValue[]) => NativeValue;

interface MotionState {
  readonly node: MotionNode;
  // In the order the animations were made: a later one wins a field.
  readonly layers: Layer[];
  // What the control held before the first animation of each field began.
  base: Pose;
  baseCenter: Vector | null;
  // The intro or outro playing, which an outro takes over from.
  running: Run | null;
  isInert: boolean;
  isHitTestVisibleBefore: boolean;
}

interface Motion<Params> {
  fn: TransitionFunction<Params | undefined>;
  params: Params | undefined;
  isIntro: boolean;
  isOutro: boolean;
}

function isMotionControl(value: NativeValue): value is MotionControl {
  return isRecord(value) && typeof read(value, "opacity") === "number" && read(value, "actualSize") !== undefined;
}

function isMotionNode(value: NativeValue): value is MotionNode {
  return isRecord(value) && isRecord(read(value, "native"));
}

function isCallable(value: NativeValue): value is Callable {
  return typeof value === "function";
}

// Entries of a pose filtered by field are a pose; fromEntries loses that.
function isPose(_value: object): _value is Pose {
  return true;
}

type TransitionResult = ReturnType<TransitionFunction<never>>;

function isConfigFunction(config: TransitionResult): config is (options: TransitionOptions) => TransitionConfig {
  return typeof config === "function";
}

function directionOf<Params>(motion: Motion<Params>) {
  const isBoth = motion.isIntro && motion.isOutro;
  if (isBoth) {
    return "both";
  }

  return motion.isIntro ? DIRECTION_IN : DIRECTION_OUT;
}

function linear(progress: number) {
  return progress;
}

function copyVector(vector: Vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z
  };
}

function controlOf(state: MotionState) {
  const control = state.node.native.control;
  return isMotionControl(control) ? control : null;
}

function sizeOf(state: MotionState) {
  return controlOf(state)?.actualSize ?? {
    x: 0,
    y: 0
  };
}

function filterPose({ pose, isKept }: {
  pose: Pose;
  isKept: (field: string) => boolean;
}) {
  const kept = Object.fromEntries(Object.entries(pose).filter(([field]) => isKept(field)));
  return isPose(kept) ? kept : {};
}

function poseOf(control: MotionControl) {
  return {
    opacity: control.opacity,
    translation: copyVector(control.translation),
    scale: copyVector(control.scale),
    rotation: control.rotation
  } satisfies Pose;
}

function writePose({ control, pose }: {
  control: MotionControl;
  pose: Pose;
}) {
  const { opacity, translation, scale, rotation } = pose;
  const isOpacitySet = opacity !== undefined;
  if (isOpacitySet) {
    control.opacity = opacity;
  }

  const isTranslationSet = translation !== undefined;
  if (isTranslationSet) {
    control.translation = copyVector(translation);
  }

  const isScaleSet = scale !== undefined;
  if (isScaleSet) {
    control.scale = copyVector(scale);
  }

  const isRotationSet = rotation !== undefined;
  if (isRotationSet) {
    control.rotation = rotation;
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
// CSS about the middle.
function middleOf(control: MotionControl) {
  return {
    x: control.actualSize.x / 2,
    y: control.actualSize.y / 2,
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
      state.base, filterPose({
        pose: poseOf(control),
        isKept: field => layer.fields.has(field) && !held.has(field)
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
    control,
    pose: shown
  });
  const touched = touchedBy(state.layers);
  state.base = filterPose({
    pose: state.base,
    isKept: field => touched.has(field)
  });

  if (isCentering(touched)) {
    control.centerPoint = middleOf(control);
    return;
  }

  const { baseCenter } = state;
  const isCenterMoved = baseCenter !== null;
  if (isCenterMoved) {
    control.centerPoint = baseCenter;
    state.baseCenter = null;
  }
}

function removeLayer({ state, layer }: {
  state: MotionState;
  layer: Layer;
}) {
  const iLayer = state.layers.indexOf(layer);
  const isLayered = iLayer >= 0;
  if (isLayered) {
    state.layers.splice(iLayer, 1);
    render(state);
  }
}

// A leaving element takes no input, as an inert one in the browser.
function makeInert(state: MotionState) {
  const control = controlOf(state);
  const isUnableToBeInert = state.isInert || control === null;
  if (isUnableToBeInert) {
    return;
  }

  state.isInert = true;
  state.isHitTestVisibleBefore = control.isHitTestVisible;
  control.isHitTestVisible = false;
}

// The keyframes' own time runs on the engine's clock; the engine steps what
// is running on each frame, and stops the clock when nothing is.
function createEngine({ clock, onFrame, warn }: Required<ElementAnimationOptions>) {
  const states = new WeakMap<object, MotionState>();
  const steps = new Set<(now: number) => void>();
  const frameCallbacks = new Set<(time: number) => void>();
  const outros = new WeakMap<object, (onFinish: () => void) => void>();
  const introduced = new WeakSet<object>();
  const warned = new Set<string>();
  let stopClock: (() => void) | null = null;

  function frame() {
    const now = clock.now();
    const callbacks = [...frameCallbacks];
    frameCallbacks.clear();
    for (const callback of callbacks) {
      callback(now);
    }

    for (const step of steps) {
      step(now);
    }

    onFrame();
    const isIdle = steps.size === 0 && frameCallbacks.size === 0;
    if (isIdle) {
      stopClock?.();
      stopClock = null;
    }
  }

  function ensureClock() {
    stopClock ??= clock.every(frame);
  }

  function requestFrame(callback: (time: number) => void) {
    frameCallbacks.add(callback);
    ensureClock();
  }

  function stateFor(node: MotionNode) {
    const existing = states.get(node);
    const isKnown = existing !== undefined;
    if (isKnown) {
      return existing;
    }

    const created: MotionState = {
      node,
      layers: [],
      base: {},
      baseCenter: null,
      running: null,
      isInert: false,
      isHitTestVisibleBefore: true
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

    warn(`${fresh.join(", ")} cannot be animated on a WinUI control (opacity, translate, scale, rotate and transform with translate, scale and rotate can); ignored`);
  }

  function animate({ state, keyframes, options }: {
    state: MotionState;
    keyframes: Keyframe[];
    options: AnimateOptions;
  }) {
    const readings = keyframes.map(readKeyframe);
    warnOnce(readings.flatMap(reading => reading.unsupported));
    const poses = readings.map(reading => reading.pose);
    const { duration } = options;
    const isKept = keptFills.has(options.fill);
    let playState: PlayState = PlayState.IDLE;
    let startedAt = 0;

    const animation: Handle = {
      onfinish: null,
      get playState() {
        return playState;
      },
      get currentTime() {
        return playState === PlayState.IDLE ? null : Math.min(clock.now() - startedAt, duration);
      },
      cancel() {
        const isIdle = playState === PlayState.IDLE;
        if (isIdle) {
          return;
        }

        playState = PlayState.IDLE;
        steps.delete(step);
        removeLayer({
          state,
          layer
        });
      }
    };
    const layer: Layer = {
      fields: touchedFields(poses),
      animation,
      pose: {}
    };

    function show(elapsed: number) {
      layer.pose = poseAt({
        poses,
        progress: duration > 0 ? elapsed / duration : 1
      });
      render(state);
    }

    function step(now: number) {
      const elapsed = now - startedAt;
      const isDone = elapsed >= duration;
      if (!isDone) {
        show(elapsed);
        return;
      }

      playState = PlayState.FINISHED;
      steps.delete(step);

      if (isKept) {
        show(duration);
      } else {
        removeLayer({
          state,
          layer
        });
      }

      animation.onfinish?.();
    }

    playState = PlayState.RUNNING;
    startedAt = clock.now();
    addLayer({
      state,
      layer
    });
    steps.add(step);
    ensureClock();
    show(0);
    return animation;
  }

  // Svelte's own algorithm for a transition (dom/elements/transitions.js): wait
  // for the delay holding the first keyframe, then sample css(t, u) once a
  // frame along the eased path from where the counterpart stands to `target`
  // (1 for an intro, 0 for an outro), and call tick on each frame.
  function play({ state, config, target, onFinish }: {
    state: MotionState;
    config: TransitionConfig;
    target: number;
    onFinish: () => void;
  }) {
    const counterpart = state.running;
    const { delay = 0, duration = 0, css, tick, easing = linear } = config;
    const hasNothingToPlay = duration === 0 && delay === 0;
    if (hasNothingToPlay) {
      onFinish();
      return null;
    }

    const isIntro = target === 1;
    const heldStyles = css === undefined ? {} : readDeclarations(css(0, 1));
    const isHolding = isIntro && counterpart === null && css !== undefined;
    const held = isHolding ? [heldStyles, heldStyles] : [];
    let current = animate({
      state,
      keyframes: held,
      options: {
        duration: delay,
        fill: Fill.FORWARDS
      }
    });
    let origin = 1 - target;
    let total = 0;
    let isFinished = false;
    const run: Run = {
      progress() {
        if (isFinished) {
          return target;
        }

        const elapsed = current.currentTime ?? 0;
        return total > 0 ? origin + (target - origin) * easing(elapsed / total) : origin;
      },
      abort() {
        current.cancel();
        current.onfinish = null;
      }
    };

    function tickFrame() {
      const isRunning = current.playState === PlayState.RUNNING;
      if (isRunning) {
        const progress = run.progress();
        tick?.(progress, 1 - progress);
        requestFrame(tickFrame);
      }
    }

    current.onfinish = () => {
      const hold = current;
      origin = counterpart?.progress() ?? 1 - target;
      const delta = target - origin;
      total = duration * Math.abs(delta);
      const keyframes: Keyframe[] = [];
      const isSampled = total > 0 && css !== undefined;
      if (isSampled) {
        const samples = Math.ceil(total / (MILLISECONDS_PER_SECOND / FRAMES_PER_SECOND));
        for (let iSample = 0; iSample <= samples; iSample++) {
          const progress = origin + delta * easing(iSample / samples);
          keyframes.push(readDeclarations(css(progress, 1 - progress)));
        }
      }

      // The new animation is made before the old ones end, so the control
      // never shows what it held before any of them.
      current = animate({
        state,
        keyframes,
        options: {
          duration: total,
          fill: Fill.FORWARDS
        }
      });
      hold.cancel();
      counterpart?.abort();

      const isTicking = tick !== undefined && total > 0;
      if (isTicking) {
        requestFrame(tickFrame);
      }

      current.onfinish = () => {
        isFinished = true;
        tick?.(target, 1 - target);
        onFinish();
      };
    };
    return run;
  }

  // The attachment: an intro now, and an outro the renderer waits for when
  // Svelte removes the element.
  function attach<Params>({ motion, node }: {
    motion: Motion<Params>;
    node: object;
  }) {
    if (!isMotionNode(node)) {
      return undefined;
    }

    const state = stateFor(node);
    const direction = directionOf(motion);
    let config: TransitionConfig | undefined = undefined;

    // Kept from the intro to the outro, as Svelte does, so an outro that
    // reverses an intro half way goes by the same values.
    function getConfig() {
      // oxlint-disable-next-line typescript/consistent-type-assertions -- read only through getComputedStyle
      const made = motion.fn(node as never, motion.params, { direction });
      config ??= isConfigFunction(made) ? made({ direction }) : made;
      return config;
    }

    if (motion.isOutro) {
      outros.set(node, onFinish => {
        makeInert(state);
        state.running = play({
          state,
          config: getConfig(),
          target: 0,
          onFinish
        });
      });
    }

    const isFirstIntro = motion.isIntro && !introduced.has(node);
    if (isFirstIntro) {
      introduced.add(node);
      state.running = play({
        state,
        config: getConfig(),
        target: 1,
        onFinish() {
          state.running?.abort();
          state.running = null;
          config = undefined;
        }
      });
    }

    return () => {
      outros.delete(node);
    };
  }

  function computedStyle(node: MotionNode) {
    const state = stateFor(node);
    const size = sizeOf(state);
    return {
      opacity: String(controlOf(state)?.opacity ?? 1),
      transform: NO_TRANSFORM,
      filter: NO_TRANSFORM,
      display: "block",
      width: `${size.x}px`,
      height: `${size.y}px`,
      paddingTop: NO_LENGTH,
      paddingBottom: NO_LENGTH,
      marginTop: NO_LENGTH,
      marginBottom: NO_LENGTH,
      borderTopWidth: NO_LENGTH,
      borderBottomWidth: NO_LENGTH
    };
  }

  function remove({ node, remove: removeNow }: {
    node: LeavingNode;
    remove: (node: LeavingNode) => void;
  }) {
    const outro = outros.get(node);
    const isLeaving = outro !== undefined && parentElement(node) !== null;
    if (!isLeaving) {
      removeNow(node);
      return;
    }

    outros.delete(node);
    outro(() => removeNow(node));
  }

  return {
    attach,
    computedStyle,
    remove
  };
}

const dispatcherClock = {
  now: () => performance.now(),
  every: (onFrame: () => void) => startTimer({
    milliseconds: FRAME_MILLISECONDS,
    onTick: onFrame
  })
} satisfies AnimationClock;

let engine: ReturnType<typeof createEngine> | null = null;
let disableCurrent: (() => void) | null = null;

function currentEngine() {
  const current = engine;
  const isEnabled = current !== null;
  if (!isEnabled) {
    throw new Error("call enableElementAnimation() before a transition is attached");
  }

  return current;
}

/**
 * Turns on transitions: the renderer then keeps a leaving element in its
 * parent until its outro has run, and svelte/transition's functions can read
 * a control's opacity through the global `getComputedStyle`, which this
 * defines for WinUI's elements (any other element goes to the one there was,
 * if any). Call it once, before the first component is mounted. An app that
 * never imports this module does not bundle any of it.
 *
 * @param options - The clock, to step by something other than the UI thread's timer, and what to do after a frame.
 * @returns A function that turns it off again.
 */
export function enableElementAnimation(options: ElementAnimationOptions = {}) {
  disableCurrent?.();
  const created = createEngine({
    clock: options.clock ?? dispatcherClock,
    onFrame: options.onFrame ?? flush,
    warn: options.warn ?? (message => console.warn(message))
  });
  engine = created;

  const removeNode = renderer.remove.bind(renderer);
  renderer.remove = node => created.remove({
    node,
    remove: removeNode
  });

  const previousComputedStyle = read(globalThis, GET_COMPUTED_STYLE);
  // eslint-disable-next-line no-restricted-syntax -- stands in for the global getComputedStyle(element, pseudoElement)
  function computedStyleOf(node: NativeValue, ...rest: NativeValue[]) {
    if (isMotionNode(node)) {
      return created.computedStyle(node);
    }

    if (!isCallable(previousComputedStyle)) {
      throw new TypeError("getComputedStyle was given something that is not a WinUI element");
    }

    return previousComputedStyle.call(globalThis, node, ...rest);
  }

  write(globalThis, GET_COMPUTED_STYLE, computedStyleOf);

  function disable() {
    renderer.remove = removeNode;
    write(globalThis, GET_COMPUTED_STYLE, previousComputedStyle);
    engine = null;
    disableCurrent = null;
  }

  disableCurrent = disable;
  return disable;
}

/** What `@attach` takes: the element, and what undoes the attachment. */
export type TransitionAttachment = (node: object) => (() => void) | undefined;

/** A transition function that needs no parameters. */
export interface BareTransition {
  /** The transition function. */
  use: TransitionFunction<undefined>;
}

/** A transition function and the parameters it is given. */
export interface ParameterizedTransition<Params> {
  /** The transition function. */
  use: TransitionFunction<Params>;

  /** What `use` is given besides the element. */
  params: Params;
}

interface LooseTransition<Params> {
  use: TransitionFunction<Params | undefined>;
  params?: Params;
}

function attachment<Params>({ options, isIntro, isOutro }: {
  options: LooseTransition<Params>;
  isIntro: boolean;
  isOutro: boolean;
}) {
  return (node: object) => currentEngine().attach({
    motion: {
      fn: options.use,
      params: options.params,
      isIntro,
      isOutro
    },
    node
  });
}

/**
 * Svelte's `transition:` for a WinUI element, written after `@attach` in braces:
 * `transition({ use: fade, params: { duration: 200 } })`. It plays
 * when the element is made (also one made with its component, unlike
 * `transition:`: show a first render you want still with an `{#if}`) and when
 * Svelte removes it, which the renderer then holds off until it has played.
 * Only an element Svelte removes itself leaves with an outro: one that is the
 * root of its `{#if}` or `{#each}` block, not one inside a block that goes.
 *
 * @param options - The transition function (`fade`, `fly`, `scale` or `blur` from svelte/transition,
 *   `slide` with its opacity only, or your own) and its parameters.
 * @returns The attachment to put after `@attach`.
 */
export function transition(options: BareTransition): TransitionAttachment;
export function transition<Params>(options: ParameterizedTransition<Params>): TransitionAttachment;
export function transition<Params>(options: LooseTransition<Params>) {
  return attachment({
    options,
    isIntro: true,
    isOutro: true
  });
}

/**
 * Svelte's `in:` for a WinUI element: a transition that plays when the
 * element is made. See `transition`.
 *
 * @param options - The transition function and its parameters.
 * @returns The attachment to put after `@attach`.
 */
export function intro(options: BareTransition): TransitionAttachment;
export function intro<Params>(options: ParameterizedTransition<Params>): TransitionAttachment;
export function intro<Params>(options: LooseTransition<Params>) {
  return attachment({
    options,
    isIntro: true,
    isOutro: false
  });
}

/**
 * Svelte's `out:` for a WinUI element: a transition that plays when Svelte
 * removes the element, which the renderer holds off until it has played. See
 * `transition`.
 *
 * @param options - The transition function and its parameters.
 * @returns The attachment to put after `@attach`.
 */
export function outro(options: BareTransition): TransitionAttachment;
export function outro<Params>(options: ParameterizedTransition<Params>): TransitionAttachment;
export function outro<Params>(options: LooseTransition<Params>) {
  return attachment({
    options,
    isIntro: false,
    isOutro: true
  });
}
