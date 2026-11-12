import { DomErrorName, domException } from "./dom-exception.ts";
import { HandlerEventTarget } from "./event-handlers.ts";
import { defineProperty } from "./install.ts";
import { normalizeKeyframes } from "./keyframe-input.ts";
import type { KeyframeInput } from "./keyframe-input.ts";
import type { EffectTiming, EffectTimingInput } from "#src/renderer/host/animation-timing.js";
import { activeDuration, endTime, progressAt, resolveTiming } from "#src/renderer/host/animation-timing.js";
import type { ConnectedAnimationHost } from "#src/renderer/host/connected-animation.js";
import { connectElement, startConnected } from "#src/renderer/host/connected-animation.js";
import type { ElementAnimationHandle, ElementAnimationOptions } from "#src/renderer/host/element-animation.js";
import { enableElementAnimation, PlayState } from "#src/renderer/host/element-animation.js";
import type { Keyframe } from "#src/renderer/host/keyframes.js";
import { isRecord, read } from "#src/renderer/host/reflect.js";
import { ElementNode } from "#src/renderer/tree/dom.js";
import type { UIElement } from "#src/winui.js";

export type { KeyframeInput } from "./keyframe-input.ts";

const NO_COMPOSITE = "replace";

/** What `installAnimations` takes: the engine's options, and a stand-in for WinUI's connected animations. */
export interface AnimationsInstallOptions extends ElementAnimationOptions {
  /** The service the connected-animation extras use; default: the current view's. */
  readonly connectedAnimations?: ConnectedAnimationHost;
}

/** The options of `new KeyframeEffect(target, keyframes, options)` and `element.animate(keyframes, options)`. */
export interface KeyframeEffectOptions extends EffectTimingInput {
  /** The animation's `id`, which `element.animate` copies. */
  readonly id?: string;
}

type NativeAnimate = (this: object, keyframes: Keyframe[], options: EffectTimingInput) => ElementAnimationHandle;

interface AnimationsContext {
  readonly nativeAnimate: NativeAnimate;
  readonly live: Set<Animation>;
  readonly now: () => number;
}

let context: AnimationsContext | undefined;

function requireContext() {
  if (!context) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "Animations are not installed: call installAnimations() first"
    });
  }

  return context;
}

function isNativeAnimate(value: unknown): value is NativeAnimate {
  return typeof value === "function";
}

function timingInputOf(options: number | KeyframeEffectOptions | undefined) {
  return typeof options === "number" ? { duration: options } : options ?? {};
}

/** What \`getComputedTiming()\` adds to the timing. */
export interface ComputedEffectTiming extends EffectTiming {
  readonly endTime: number;
  readonly activeDuration: number;
  readonly localTime: number | null;
  readonly progress: number | null;
}

/** The keyframes and timing of an animation, and the element it acts on: the web's `KeyframeEffect`. */
export class KeyframeEffect {
  target: object | null;
  readonly composite = NO_COMPOSITE;
  readonly pseudoElement = null;
  private keyframes: Keyframe[];
  private timing: EffectTiming;
  private owner: Animation | null = null;

  constructor(target: object | null, keyframes: KeyframeInput | null, options?: number | KeyframeEffectOptions) {
    this.target = target;
    this.keyframes = normalizeKeyframes(keyframes);
    this.timing = resolveTiming(timingInputOf(options));
  }

  /** The keyframes, each as a plain object. */
  getKeyframes() {
    return this.keyframes.map(keyframe => ({ ...keyframe }));
  }

  /** Replaces the keyframes; one that is playing keeps the ones it started with. */
  setKeyframes(keyframes: KeyframeInput | null) {
    this.keyframes = normalizeKeyframes(keyframes);
  }

  /** The timing the effect was given, with the web's defaults. */
  getTiming() {
    return this.timing;
  }

  /** The timing and where the animation is in it. */
  getComputedTiming() {
    const localTime = this.owner?.currentTime ?? null;
    return {
      ...this.timing,
      fill: this.timing.fill === "auto" ? "none" : this.timing.fill,
      endTime: endTime(this.timing),
      activeDuration: activeDuration(this.timing),
      localTime,
      progress: localTime === null ? null : progressAt({
        timing: this.timing,
        time: localTime
      })
    } satisfies ComputedEffectTiming;
  }

  /** Changes the timing; what is not given stays. */
  updateTiming(timing: EffectTimingInput = {}) {
    this.timing = resolveTiming({
      ...this.timing,
      ...timing
    });
    this.owner?.retime(this.timing);
  }

  /** Called by the animation that plays this effect. */
  attach(owner: Animation | null) {
    this.owner = owner;
  }
}

/** What the `finish` and `cancel` events of an animation carry. */
export class AnimationPlaybackEvent extends Event {
  readonly currentTime: number | null;
  readonly timelineTime: number | null;

  constructor(type: string, init: {
    currentTime?: number | null;
    timelineTime?: number | null;
  } = {}) {
    super(type);
    this.currentTime = init.currentTime ?? null;
    this.timelineTime = init.timelineTime ?? null;
  }
}

/** The values `Animation.playState` takes, with `pending` never: WinUI starts at once. */
export type AnimationPlayState = PlayState;

function abortedError() {
  return domException({
    name: DomErrorName.ABORT,
    message: "The animation was cancelled"
  });
}

/** The web's `Animation` over an element's control: play, pause, finish, cancel, reverse, rate and `finished`. */
export class Animation extends HandlerEventTarget {
  id = "";
  readonly pending = false;
  readonly replaceState = "active";
  private effectValue: KeyframeEffect | null;
  private handle: ElementAnimationHandle | null = null;
  private finishedSettlement = Promise.withResolvers<this>();
  private isFinishedSettled = false;
  private pendingRate = 1;

  constructor(effect: KeyframeEffect | null = null) {
    super();
    this.effectValue = effect;
    effect?.attach(this);
    this.finishedSettlement.promise.catch(() => undefined);
  }

  /** The effect being played. */
  get effect() {
    return this.effectValue;
  }

  set effect(effect: KeyframeEffect | null) {
    this.release();
    this.effectValue?.attach(null);
    this.effectValue = effect;
    effect?.attach(this);
  }

  /** The document timeline, whose time is the clock the animations step by. */
  get timeline() {
    const { now } = requireContext();
    return {
      get currentTime() {
        return now();
      }
    };
  }

  /** `idle`, `running`, `paused` or `finished`. */
  get playState() {
    return this.handle?.playState ?? PlayState.IDLE;
  }

  /** Milliseconds into the animation, or null when it is idle. */
  get currentTime() {
    return this.handle?.currentTime ?? null;
  }

  set currentTime(time: number | null) {
    const { handle } = this;
    const hasHandle = handle !== null;
    if (hasHandle) {
      handle.currentTime = time;
    }
  }

  /** The timeline time the animation started at, or null when it is idle or paused. */
  get startTime() {
    const isRunning = this.playState === PlayState.RUNNING || this.playState === PlayState.FINISHED;
    const time = this.currentTime;
    const isStarted = isRunning && time !== null;
    return isStarted ? requireContext().now() - time / this.playbackRate : null;
  }

  /** How fast it plays; negative plays backwards. */
  get playbackRate() {
    return this.handle?.playbackRate ?? this.pendingRate;
  }

  set playbackRate(rate: number) {
    this.pendingRate = rate;

    const { handle } = this;
    const hasHandle = handle !== null;
    if (hasHandle) {
      handle.playbackRate = rate;
    }
  }

  /** Resolved at once: nothing waits for WinUI to be ready to play. */
  get ready() {
    return Promise.resolve(this);
  }

  /** Resolves when it reaches the end (or the start, backwards); rejects with an `AbortError` when cancelled. */
  get finished() {
    return this.finishedSettlement.promise;
  }

  /** Starts or resumes; from the end it starts over. */
  play() {
    const hasTarget = this.effectValue?.target != null;
    if (!hasTarget) {
      return;
    }

    this.renewFinished();
    const handle = this.ensureHandle();
    handle.playbackRate = this.pendingRate;
    handle.play();
    requireContext().live.add(this);
  }

  /** Holds it where it is. */
  pause() {
    this.ensureHandle().pause();
  }

  /** Jumps to the end (or the start, backwards) and finishes. */
  finish() {
    this.ensureHandle().finish();
  }

  /** Stops it, takes its effect off the element and rejects `finished`. */
  cancel() {
    this.handle?.cancel();
  }

  /** Plays the other way from where it is. */
  reverse() {
    this.playbackRate = -this.playbackRate;
    this.play();
  }

  /** Sets the playback rate, as `playbackRate` does. */
  updatePlaybackRate(rate: number) {
    this.playbackRate = rate;
  }

  /** A no-op: the animation is not removed when other animations cover it. */
  persist() {}

  /** Called by the effect when its timing changes. */
  retime(timing: EffectTiming) {
    this.handle?.updateTiming(timing);
  }

  private release() {
    const { handle } = this;
    const isIdle = handle === null;
    if (isIdle) {
      return;
    }

    handle.onfinish = null;
    handle.oncancel = null;
    handle.cancel();
    this.handle = null;
    context?.live.delete(this);
  }

  private ensureHandle() {
    const existing = this.handle;
    const isMade = existing !== null;
    if (isMade) {
      return existing;
    }

    const effect = this.effectValue;
    const target = effect?.target;
    const isUnplayable = effect === null || target == null;
    if (isUnplayable) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The animation has no effect on an element"
      });
    }

    const handle = requireContext().nativeAnimate.call(target, effect.getKeyframes(), effect.getTiming());
    handle.onfinish = () => this.settleFinished();
    handle.oncancel = () => this.settleCancelled();
    this.handle = handle;
    requireContext().live.add(this);
    return handle;
  }

  private renewFinished() {
    if (this.isFinishedSettled) {
      this.finishedSettlement = Promise.withResolvers<this>();
      this.finishedSettlement.promise.catch(() => undefined);
      this.isFinishedSettled = false;
    }
  }

  private settleFinished() {
    this.isFinishedSettled = true;
    this.finishedSettlement.resolve(this);
    this.dispatchEvent(
      new AnimationPlaybackEvent("finish", {
        currentTime: this.currentTime,
        timelineTime: requireContext().now()
      })
    );
  }

  private settleCancelled() {
    context?.live.delete(this);

    if (!this.isFinishedSettled) {
      this.finishedSettlement.reject(abortedError());
    }

    this.isFinishedSettled = true;
    this.dispatchEvent(
      new AnimationPlaybackEvent("cancel", {
        timelineTime: requireContext().now()
      })
    );
  }

  /** The `onfinish` handler property. */
  get onfinish() {
    return this.getHandler("finish");
  }

  set onfinish(handler: EventListener | null) {
    this.setHandler({
      type: "finish",
      handler
    });
  }

  /** The `oncancel` handler property. */
  get oncancel() {
    return this.getHandler("cancel");
  }

  set oncancel(handler: EventListener | null) {
    this.setHandler({
      type: "cancel",
      handler
    });
  }
}

declare global {
  // The connected-animation extras join the standard element wherever this module is imported.
  interface Element {
    /**
     * WinUI only: remembers the element as the start of a connected
     * animation, to be finished by `startConnectedAnimation` with the same key
     * on the next page. Call it just before navigating away.
     */
    prepareConnectedAnimation?(key: string): void;

    /**
     * WinUI only: plays the connected animation `prepareConnectedAnimation`
     * set up under the key, from where that element was to this one.
     *
     * @returns True when it started, false when none was prepared under the key.
     */
    startConnectedAnimation?(key: string): boolean;
  }
}

// The tag fixes the control's class; the engine cannot check that from here.
function isElementControl(_value: object): _value is UIElement {
  return true;
}

function controlOf(node: object) {
  const control = read(read(node, "native"), "control");
  const isControl = isRecord(control) && isElementControl(control);
  if (!isControl) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The element has no WinUI control yet"
    });
  }

  return control;
}

/**
 * Gives the tree's elements the Web Animations API: `element.animate()` returns
 * an `Animation` with `play`, `pause`, `finish`, `cancel`, `reverse`,
 * `currentTime`, `playbackRate`, `finished` and the `finish` and `cancel`
 * events, `element.getAnimations()` lists them, and `Animation` and
 * `KeyframeEffect` are defined on the global scope. They are the element
 * animation engine's (`enableElementAnimation`, which this turns on): the
 * control's opacity, translation, scale, rotation, size, margin and the rest
 * that engine animates, with the keyframes spaced evenly (an `offset` or a
 * per-keyframe `easing` is ignored) and the timing's `delay`, `endDelay`,
 * `iterations`, `direction`, `easing` and `fill` honoured. What WinUI cannot
 * animate is ignored with one warning. Beyond the web: `prepareConnectedAnimation(key)`
 * and `startConnectedAnimation(key)` on elements, over WinUI's connected
 * animations. Not covered: `document.getAnimations()`, composite modes,
 * pseudo-elements and scroll timelines.
 *
 * @param options - The engine's options (its clock, for a test), and a stand-in for the connected animation service.
 * @returns A function that puts the elements back as they were; the engine stays on unless options were given.
 */
export function installAnimations(options?: AnimationsInstallOptions) {
  const { connectedAnimations, ...engineOptions } = options ?? {};
  const hasEngineOptions = Object.keys(engineOptions).length > 0;
  const disableEngine = enableElementAnimation(hasEngineOptions ? engineOptions : undefined);
  const nativeAnimate = read(ElementNode.prototype, "animate");
  if (!isNativeAnimate(nativeAnimate)) {
    throw new Error("the element animation engine did not define animate()");
  }

  const installed: AnimationsContext = {
    nativeAnimate,
    live: new Set(),
    now: () => options?.clock?.now() ?? performance.now()
  };
  context = installed;
  const connectedHost = connectedAnimations === undefined ? {} : { host: connectedAnimations };
  const restores = [
    defineProperty({
      name: "animate",
      target: ElementNode.prototype,
      value(this: object, keyframes: KeyframeInput, timing?: number | KeyframeEffectOptions) {
        const animation = new Animation(new KeyframeEffect(this, keyframes, timing));
        animation.id = typeof timing === "object" ? timing.id ?? "" : "";
        animation.play();
        return animation;
      }
    }),
    defineProperty({
      name: "getAnimations",
      target: ElementNode.prototype,
      value(this: object) {
        return [...installed.live].filter(animation => {
          const isOurs = animation.effect?.target === this;
          return isOurs && animation.playState !== PlayState.IDLE;
        });
      }
    }),
    defineProperty({
      name: "prepareConnectedAnimation",
      target: ElementNode.prototype,
      value(this: object, key: string) {
        connectElement({
          key,
          element: controlOf(this),
          ...connectedHost
        });
      }
    }),
    defineProperty({
      name: "startConnectedAnimation",
      target: ElementNode.prototype,
      value(this: object, key: string) {
        return startConnected({
          key,
          element: controlOf(this),
          ...connectedHost
        });
      }
    }),
    defineProperty({
      name: "Animation",
      value: Animation
    }),
    defineProperty({
      name: "KeyframeEffect",
      value: KeyframeEffect
    }),
    defineProperty({
      name: "AnimationPlaybackEvent",
      value: AnimationPlaybackEvent
    })
  ];
  return () => {
    for (const restore of restores.reverse()) {
      restore();
    }

    for (const animation of installed.live) {
      animation.cancel();
    }

    context = undefined;

    if (hasEngineOptions) {
      disableEngine();
    }
  };
}
