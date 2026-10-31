// fallow-ignore-file unused-type
import type { Scheduler } from "./scheduler.ts";

/** What `node:timers/promises` takes as its last argument. */
export interface PromiseTimerOptions {
  /** Rejects with an `AbortError` and cancels the timer when it aborts. */
  signal?: AbortSignal | undefined;

  /** Default true; false calls `unref` on the timer. */
  ref?: boolean | undefined;
}

function abortedSignal(signal: AbortSignal | undefined) {
  const isAbortedSignal = signal?.aborted === true;
  if (isAbortedSignal) {
    return signal;
  }

  return undefined;
}

class AbortError extends Error {
  readonly code = "ABORT_ERR";

  constructor(signal: AbortSignal) {
    super("The operation was aborted", { cause: signal.reason });
    this.name = "AbortError";
  }
}

function waitFor<T>({ signal, begin }: {
  signal: AbortSignal | undefined;
  begin: (settle: (value: T) => void) => () => void;
}) {
  return new Promise<T>((resolve, reject) => {
    const abortedBefore = abortedSignal(signal);
    const isAborted = abortedBefore !== undefined;
    if (isAborted) {
      reject(new AbortError(abortedBefore));
      return;
    }

    function abort() {
      cancel();

      const hasSignal = signal !== undefined;
      if (hasSignal) {
        reject(new AbortError(signal));
      }
    }

    const cancel = begin(value => {
      signal?.removeEventListener("abort", abort);
      resolve(value);
    });
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/**
 * `node:timers/promises` over a scheduler: `setTimeout`, `setImmediate`,
 * `setInterval` (an async iterator) and `scheduler.wait` and `scheduler.yield`,
 * with `AbortSignal` support.
 */
export function createPromiseTimers(timers: Scheduler) {
  // eslint-disable-next-line no-restricted-syntax -- mirrors the positional signature of node:timers/promises
  function setTimeout<T = void>(delay?: number, value?: T, options: PromiseTimerOptions = {}) {
    return waitFor<T | undefined>({
      signal: options.signal,
      begin(settle) {
        const timeout = timers.setTimeout(settle, delay, value);
        const isUnrefRequested = options.ref === false;
        if (isUnrefRequested) {
          timeout.unref();
        }

        return () => timers.clearTimeout(timeout);
      }
    });
  }

  // eslint-disable-next-line no-restricted-syntax -- mirrors the positional signature of node:timers/promises
  function setImmediate<T = void>(value?: T, options: PromiseTimerOptions = {}) {
    return waitFor<T | undefined>({
      signal: options.signal,
      begin(settle) {
        const immediate = timers.setImmediate(settle, value);
        const isUnrefRequested = options.ref === false;
        if (isUnrefRequested) {
          immediate.unref();
        }

        return () => timers.clearImmediate(immediate);
      }
    });
  }

  // eslint-disable-next-line no-restricted-syntax -- mirrors the positional signature of node:timers/promises
  async function* setInterval<T = void>(delay?: number, value?: T, options: PromiseTimerOptions = {}) {
    const { signal } = options;
    const abortedBefore = abortedSignal(signal);
    const isAborted = abortedBefore !== undefined;
    if (isAborted) {
      throw new AbortError(abortedBefore);
    }

    let pending = 0;
    let wake: (() => void) | undefined;
    const interval = timers.setInterval(() => {
      pending += 1;
      wake?.();
    }, delay);
    const isUnrefRequested = options.ref === false;
    if (isUnrefRequested) {
      interval.unref();
    }

    function onAbort() {
      wake?.();
    }

    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      for (;;) {
        const aborted = abortedSignal(signal);
        const isAborted = aborted !== undefined;
        if (isAborted) {
          throw new AbortError(aborted);
        }

        const isIdle = pending === 0;
        if (isIdle) {
          await new Promise<void>(resolve => {
            wake = resolve;
          });
        } else {
          pending -= 1;
          yield value;
        }
      }
    } finally {
      timers.clearInterval(interval);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    setTimeout,
    setImmediate,
    setInterval,
    scheduler: {
      wait: (delay: number, options?: PromiseTimerOptions) => setTimeout(delay, undefined, options),
      yield: () => setImmediate()
    }
  };
}
