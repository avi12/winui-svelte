import { uiTimers } from "./ui-timers.ts";
import type { TimerBackend } from "./ui-timers.ts";
import { DispatcherQueue } from "#src/winui.js";

// WinUI holds this thread, so Node's own timers never fire here (see
// ui-timers.ts). Every timer on the thread, `setTimeout` included, runs on
// one DispatcherQueue timer and the dispatcher's queue.

const TICKS_PER_MILLISECOND = 10_000n;

/** What a dispatcher timer does, and how often. */
export interface TimerOptions {
  /** The time between ticks, or until the one tick when it does not repeat. */
  milliseconds: number;

  /** Runs on each tick. */
  onTick: () => void;

  /** Default true; false runs `onTick` once. */
  isRepeating?: boolean;
}

function createDispatcherBackend(fire: () => void) {
  const queue = DispatcherQueue.getForCurrentThread();
  let alarm: ReturnType<typeof queue.createTimer> | undefined;

  function disarm() {
    alarm?.stop();
    alarm = undefined;
  }

  return {
    arm(delay: number) {
      disarm();
      const timer = queue.createTimer();
      timer.isRepeating = false;
      timer.interval = { duration: BigInt(Math.max(1, Math.ceil(delay))) * TICKS_PER_MILLISECOND };
      timer.onTick(() => {
        alarm = undefined;
        fire();
      });
      timer.start();
      alarm = timer;
    },
    disarm,
    enqueue(callback: () => void) {
      queue.tryEnqueue(callback);
    }
  } satisfies TimerBackend;
}

/**
 * Moves the thread's timers onto the dispatcher; call it on the UI thread once
 * WinUI is up. `runWindow` does. Timers set before keep their time.
 */
export function useDispatcherTimers() {
  uiTimers().useBackend(createDispatcherBackend);
}

/**
 * Starts a timer; call it on the UI thread. Returns what stops it. It is
 * `setInterval` (or `setTimeout` when `isRepeating` is false) with the stop
 * handed back as a function, on the same scheduler as the standard timers.
 */
export function startTimer(options: TimerOptions) {
  const { scheduler } = uiTimers();
  const isRepeating = options.isRepeating ?? true;
  const timer = isRepeating
    ? scheduler.setInterval(options.onTick, options.milliseconds)
    : scheduler.setTimeout(options.onTick, options.milliseconds);
  return () => scheduler.clearTimeout(timer);
}

/**
 * Stops every timer, standard and `startTimer` alike, and refuses new ones
 * until the next `useDispatcherTimers`. The application calls it as it exits:
 * a tick that fires while the windows are torn down reads controls that are
 * already gone, and the process ends with a failure code.
 */
export function stopAllTimers() {
  uiTimers().scheduler.stopAll();
}
