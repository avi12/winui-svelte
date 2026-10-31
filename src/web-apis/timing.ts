import { defineProperty } from "./install.ts";
import type { AnimationClock } from "#src/renderer/host/frame-clock.js";
import { dispatcherClock } from "#src/renderer/host/frame-clock.js";

const IDLE_PERIOD_MILLISECONDS = 50;

/** What a `requestIdleCallback` callback is given: whether its timeout made it run, and the time left. */
export interface IdleDeadline {
  readonly didTimeout: boolean;

  /** Milliseconds left of the idle period, 0 when it is over. */
  timeRemaining(): number;
}

/** The options of `requestIdleCallback`. */
export interface IdleRequestOptions {
  /** Milliseconds after which the callback runs even when the app is never idle. */
  readonly timeout?: number;
}

/** What `installTiming` takes. */
export interface TimingInstallOptions {
  /** The frame source; default: the UI thread's dispatcher timer, about every 16 milliseconds. */
  readonly clock?: AnimationClock;
}

interface IdleRequest {
  readonly callback: (deadline: IdleDeadline) => void;
  readonly requestedAt: number;
  readonly timeout: number | undefined;
}

function runGuarded(work: () => void) {
  try {
    work();
  } catch (error) {
    console.error(error);
  }
}

/**
 * Defines `requestAnimationFrame`, `cancelAnimationFrame`, `requestIdleCallback`
 * and `cancelIdleCallback` on the global scope, stepped by the UI thread's
 * dispatcher: one tick is one frame, and a callback runs once, on the next
 * tick. Idle callbacks run after the frame callbacks, while the tick's 50
 * milliseconds last. With the element animations on (`enableElementAnimation`,
 * which the Vite plugin calls for a component that uses transitions) the
 * animation frame is that engine's own; both step on the same timer.
 *
 * @param options - The frame source, to step by something other than the UI thread's timer.
 * @returns A function that removes the four functions and stops the timer.
 */
export function installTiming(options: TimingInstallOptions = {}) {
  const clock = options.clock ?? dispatcherClock;
  const frameCallbacks = new Map<number, (time: number) => void>();
  const idleRequests = new Map<number, IdleRequest>();
  let lastId = 0;
  let stopClock: (() => void) | null = null;

  function runIdle(now: number) {
    const periodEnd = now + IDLE_PERIOD_MILLISECONDS;
    function deadline(hasTimedOut: boolean) {
      return {
        didTimeout: hasTimedOut,
        timeRemaining: () => Math.max(periodEnd - clock.now(), 0)
      };
    }

    for (const [id, request] of idleRequests) {
      const hasTimedOut = request.timeout !== undefined && now - request.requestedAt >= request.timeout;
      const isOutOfTime = clock.now() >= periodEnd;
      const isDeferred = isOutOfTime && !hasTimedOut;
      if (isDeferred) {
        continue;
      }

      idleRequests.delete(id);
      runGuarded(() => request.callback(deadline(hasTimedOut)));
    }
  }

  function tick() {
    const now = clock.now();
    const callbacks = [...frameCallbacks.values()];
    frameCallbacks.clear();
    for (const callback of callbacks) {
      runGuarded(() => callback(now));
    }

    runIdle(now);
    const isIdle = frameCallbacks.size === 0 && idleRequests.size === 0;
    if (isIdle) {
      stopClock?.();
      stopClock = null;
    }
  }

  function ensureClock() {
    stopClock ??= clock.every(tick);
  }

  function requestFrame(callback: (time: number) => void) {
    lastId++;
    frameCallbacks.set(lastId, callback);
    ensureClock();
    return lastId;
  }

  function requestIdle(callback: (deadline: IdleDeadline) => void, init: IdleRequestOptions = {}) {
    lastId++;
    idleRequests.set(lastId, {
      callback,
      requestedAt: clock.now(),
      timeout: init.timeout
    });
    ensureClock();
    return lastId;
  }

  const restores = [
    defineProperty({
      name: "requestAnimationFrame",
      value: requestFrame
    }),
    defineProperty({
      name: "cancelAnimationFrame",
      value: (id: number) => frameCallbacks.delete(id)
    }),
    defineProperty({
      name: "requestIdleCallback",
      value: requestIdle
    }),
    defineProperty({
      name: "cancelIdleCallback",
      value: (id: number) => idleRequests.delete(id)
    })
  ];
  return () => {
    stopClock?.();
    stopClock = null;
    frameCallbacks.clear();
    idleRequests.clear();
    for (const restore of restores.reverse()) {
      restore();
    }
  };
}
