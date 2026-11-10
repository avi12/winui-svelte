/** Runs something again and again at an interval, until told to stop. */
export interface FrameScheduler {
  /**
   * Starts a repeating timer.
   *
   * @param options - How often, and what to run.
   * @returns A function that stops it.
   */
  every(options: {
    readonly intervalMilliseconds: number;
    readonly run: () => void;
  }): () => void;
}

/**
 * The timer a feed polls on: a timeout re-armed from a running deadline, so a
 * late tick does not push every later one back (an interval would drift), and
 * a tick that ran long is not made up for by a burst.
 *
 * @returns The scheduler; its callbacks run on the thread that calls `every`.
 */
export function createTimerScheduler() {
  return {
    every({ intervalMilliseconds, run }) {
      let deadline = performance.now() + intervalMilliseconds;
      let timer: NodeJS.Timeout | undefined = undefined;

      function arm() {
        timer = setTimeout(fire, Math.max(0, Math.floor(deadline - performance.now())));
      }

      function fire() {
        run();
        deadline = Math.max(deadline + intervalMilliseconds, performance.now());
        arm();
      }

      arm();
      return () => clearTimeout(timer);
    }
  } satisfies FrameScheduler;
}
