import { startTimer } from "#src/window/timers.js";

const FRAME_MILLISECONDS = 16;

/** What drives the animations: a time that only moves forward, and a ticking frame. */
export interface AnimationClock {
  /** Milliseconds on a clock that only moves forward. */
  now(): number;

  /** Calls `onFrame` about every frame until the returned function is called. */
  every(onFrame: () => void): () => void;
}

/** The UI thread's dispatcher timer, about every 16 milliseconds: the clock a window steps by. */
export const dispatcherClock = {
  now: () => performance.now(),
  every: (onFrame: () => void) => startTimer({
    milliseconds: FRAME_MILLISECONDS,
    onTick: onFrame
  })
} satisfies AnimationClock;
