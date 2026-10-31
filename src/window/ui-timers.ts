// fallow-ignore-file unused-type
import type { TimerDriver } from "./scheduler.ts";
import { createScheduler } from "./scheduler.ts";

// The one scheduler of the UI thread, behind every timer there: the standard
// ones (installUiTimers) and startTimer. Its alarm is libuv's until the
// window's loop starts; then the dispatcher's takes over (useBackend), which
// is driven by messages and so needs no polling. libuv's own timers stay
// available as `libuv`, which the message pump needs for its turns.

/** The alarm and the queue a scheduler sits on; the clock is always `performance.now`. */
export type TimerBackend = Omit<TimerDriver, "now">;

/** Makes a backend; `fire` is what its alarm calls. */
export type TimerBackendFactory = (fire: () => void) => TimerBackend;

function captureLibuvTimers() {
  return {
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    setImmediate: globalThis.setImmediate
  };
}

function createNodeBackend({ fire, original }: {
  fire: () => void;
  original: ReturnType<typeof captureLibuvTimers>;
}) {
  let alarm: ReturnType<typeof setTimeout> | undefined;
  return {
    arm(delay: number) {
      original.clearTimeout(alarm);
      alarm = original.setTimeout(fire, delay);
    },
    disarm() {
      original.clearTimeout(alarm);
      alarm = undefined;
    },
    enqueue(callback: () => void) {
      original.setImmediate(callback);
    }
  };
}

function createUiTimers() {
  const link: { fire: () => void } = { fire: () => undefined };
  function fire() {
    link.fire();
  }
  const libuv = captureLibuvTimers();
  const current = {
    backend: createNodeBackend({
      fire,
      original: libuv
    })
  };
  const scheduler = createScheduler(realFire => {
    link.fire = realFire;
    return {
      now: () => performance.now(),
      arm: delay => current.backend.arm(delay),
      disarm: () => current.backend.disarm(),
      enqueue: callback => current.backend.enqueue(callback)
    };
  });
  return {
    scheduler,
    libuv,
    useBackend(make: TimerBackendFactory) {
      current.backend.disarm();
      current.backend = make(fire);
      scheduler.reattach();
    }
  };
}

type UiTimers = ReturnType<typeof createUiTimers>;

// One per thread, whichever copy of this module asks: an app that loads the
// window module through a module runner (hot updates) has a second copy, and
// two schedulers would mean timers set through one never fire on the other's
// clock.
const SHARED_KEY = Symbol.for("winui-svelte.ui-timers");

function isUiTimers(value: unknown): value is UiTimers {
  return typeof value === "object" && value !== null && "scheduler" in value && "libuv" in value && "useBackend" in value;
}

/** The UI thread's scheduler (see `createScheduler`), made on first use. */
export function uiTimers() {
  const existing: unknown = Object.getOwnPropertyDescriptor(globalThis, SHARED_KEY)?.value;
  if (isUiTimers(existing)) {
    return existing;
  }

  const created = createUiTimers();
  Object.defineProperty(globalThis, SHARED_KEY, { value: created });
  return created;
}
