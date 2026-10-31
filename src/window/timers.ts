import { DispatcherQueue } from "#src/winui.js";

// Timers on the UI thread's dispatcher. WinUI holds this thread, so Node's own
// timers and message events never fire here; whatever the window needs to do
// on a clock (take in a host's messages, a hot update) runs on one of these.

const TICKS_PER_MILLISECOND = 10_000n;

type Timer = ReturnType<DispatcherQueue["createTimer"]>;

// Held for as long as they run: a timer whose wrapper is collected stops.
const heldTimers = new Set<Timer>();
let isShutdownWatched = false;

/** What a dispatcher timer does, and how often. */
export interface TimerOptions {
  /** The time between ticks, or until the one tick when it does not repeat. */
  milliseconds: number;

  /** Runs on each tick. */
  onTick: () => void;

  /** Default true; false runs `onTick` once. */
  isRepeating?: boolean;
}

/** Starts a timer; call it on the UI thread. Returns what stops it. */
export function startTimer(options: TimerOptions) {
  const queue = DispatcherQueue.getForCurrentThread();
  if (!isShutdownWatched) {
    isShutdownWatched = true;
    queue.onceShutdownStarting(stopAllTimers);
  }

  const timer = queue.createTimer();
  timer.interval = { duration: BigInt(options.milliseconds) * TICKS_PER_MILLISECOND };
  timer.isRepeating = options.isRepeating ?? true;
  timer.onTick(options.onTick);
  heldTimers.add(timer);
  timer.start();
  return () => {
    timer.stop();
    heldTimers.delete(timer);
  };
}

/**
 * Stops every timer still running: the one teardown of the timers. A tick
 * that fires while the windows are being torn down reads controls that are
 * already gone, and the process ends with a failure code. `exitApplication`
 * calls it, and so does the dispatcher queue's shutdown, which every other
 * way the application ends (the last window closing, `runWindow` finishing)
 * goes through.
 */
export function stopAllTimers() {
  for (const timer of heldTimers) {
    timer.stop();
  }

  heldTimers.clear();
}
