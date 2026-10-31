// fallow-ignore-file unused-class-member
// fallow-ignore-file unused-export
import { TimerQueue } from "./timer-queue.ts";

// Node's timers, in the shape of the web's: one scheduler over one native
// clock. The thread that runs WinUI cannot use libuv's (its loop is inside the
// message loop and never turns), so the clock and the queue of work for the
// next turn come from a driver.

const MAXIMUM_DELAY_BITS = 31;
const MAXIMUM_DELAY = 2 ** MAXIMUM_DELAY_BITS - 1;
const MINIMUM_DELAY = 1;
// A browser clamps a timer to 4 ms once timers have nested more than 5 deep.
const NESTING_LIMIT = 5;
const NESTING_MINIMUM_DELAY = 4;
const STALE_ENTRY_ALLOWANCE = 64;

/** What a scheduler runs on: a clock, one alarm, and a queue for the next turn. */
export interface TimerDriver {
  /** Milliseconds on a clock that only goes forward. */
  now(): number;

  /** Calls `fire` once after at least `delay` milliseconds; replaces the alarm that was set. */
  arm(delay: number): void;

  /** Cancels the alarm. */
  disarm(): void;

  /** Runs `callback` on a later turn, before the next alarm is waited for. */
  enqueue(callback: () => void): void;
}

interface TimerHost {
  start(timeout: Timeout): void;
  stop(timeout: Timeout): void;
}

interface TimeoutOptions {
  id: number;
  invoke: (self: Timeout) => void;
  delay: number;
  nesting: number;
  isRepeating: boolean;
  host: TimerHost;
}

/** What `setTimeout` and `setInterval` return; the same members as Node's `Timeout`. */
export class Timeout {
  readonly id: number;
  readonly invoke: (self: Timeout) => void;
  readonly delay: number;
  readonly isRepeating: boolean;
  nesting: number;
  isActive = false;
  isRefed = true;
  dueAt = 0;
  sequence = 0;
  private readonly host: TimerHost;

  constructor(options: TimeoutOptions) {
    this.id = options.id;
    this.invoke = options.invoke;
    this.delay = options.delay;
    this.nesting = options.nesting;
    this.isRepeating = options.isRepeating;
    this.host = options.host;
  }

  /** Marks the timer as one that keeps the thread alive; timers here never do, so this only answers `hasRef`. */
  ref() {
    this.isRefed = true;
    return this;
  }

  /** The counterpart of `ref`. */
  unref() {
    this.isRefed = false;
    return this;
  }

  /** Whether `ref` was the last of the two called. */
  hasRef() {
    return this.isRefed;
  }

  /** Starts the wait again from now; a timer that already fired is scheduled once more. */
  refresh() {
    this.host.start(this);
    return this;
  }

  /** Cancels the timer, as `clearTimeout` does. */
  close() {
    this.host.stop(this);
    return this;
  }

  [Symbol.toPrimitive]() {
    return this.id;
  }

  [Symbol.dispose]() {
    this.close();
  }
}

/** What `setImmediate` returns. */
export class Immediate {
  readonly invoke: (self: Immediate) => void;
  isActive = true;
  isRefed = true;

  constructor(invoke: (self: Immediate) => void) {
    this.invoke = invoke;
  }

  /** See `Timeout.ref`. */
  ref() {
    this.isRefed = true;
    return this;
  }

  /** See `Timeout.unref`. */
  unref() {
    this.isRefed = false;
    return this;
  }

  /** See `Timeout.hasRef`. */
  hasRef() {
    return this.isRefed;
  }

  [Symbol.dispose]() {
    this.isActive = false;
  }
}

interface Entry {
  readonly timeout: Timeout;
  readonly dueAt: number;
  readonly sequence: number;
}

class InvalidCallbackError extends TypeError {
  readonly code = "ERR_INVALID_ARG_TYPE";

  constructor(received: unknown) {
    super(`The "callback" argument must be of type function. Received ${typeof received}`);
  }
}

function assertCallback(callback: unknown) {
  const isFunction = typeof callback === "function";
  if (!isFunction) {
    throw new InvalidCallbackError(callback);
  }
}

function normalizedDelay(delay: unknown) {
  const milliseconds = Number(delay);
  const isInRange = milliseconds >= MINIMUM_DELAY && milliseconds <= MAXIMUM_DELAY;
  if (isInRange) {
    return milliseconds;
  }

  return MINIMUM_DELAY;
}

function delayAtNesting({ delay, nesting }: {
  delay: number;
  nesting: number;
}) {
  const isClamped = nesting > NESTING_LIMIT;
  if (isClamped) {
    return Math.max(delay, NESTING_MINIMUM_DELAY);
  }

  return delay;
}

function rethrowLater(error: unknown) {
  queueMicrotask(() => {
    throw error;
  });
}

/**
 * Timers and immediates over `createDriver`'s clock, with the semantics of
 * Node's (the `Timeout` and `Immediate` members, extra arguments, `this` in
 * the callback, ids that `clearTimeout` takes) and the browser's 4 ms clamp
 * for deeply nested timers. A callback that throws does not stop the others;
 * its error is rethrown from a microtask, which is an uncaught exception, as
 * in Node. `createDriver` receives `fire`, which the driver calls when its
 * alarm goes off.
 */
export function createScheduler(createDriver: (fire: () => void) => TimerDriver) {
  const queue = new TimerQueue<Entry>();
  const active = new Map<number, Timeout>();
  let immediates: Immediate[] = [];
  let nextId = 1;
  let sequence = 0;
  let nesting = 0;
  let armedDueAt: number | undefined;
  let isRunning = false;
  let isDrainQueued = false;
  let isStopped = false;
  const driver = createDriver(run);

  function isLive(entry: Entry) {
    return entry.timeout.isActive && entry.timeout.sequence === entry.sequence;
  }

  function nextLive() {
    for (let entry = queue.peek(); entry !== undefined; entry = queue.peek()) {
      if (isLive(entry)) {
        return entry;
      }

      queue.pop();
    }

    return undefined;
  }

  function arm() {
    if (isRunning) {
      return;
    }

    const next = nextLive();
    const isEmpty = next === undefined;
    if (isEmpty) {
      armedDueAt = undefined;
      driver.disarm();
      return;
    }

    const isArmedInTime = armedDueAt !== undefined && armedDueAt <= next.dueAt;
    if (isArmedInTime) {
      return;
    }

    armedDueAt = next.dueAt;
    driver.arm(Math.max(0, next.dueAt - driver.now()));
  }

  function start(timeout: Timeout) {
    if (isStopped) {
      return;
    }

    sequence += 1;
    timeout.isActive = true;
    timeout.sequence = sequence;
    timeout.dueAt = driver.now() + delayAtNesting({
      delay: timeout.delay,
      nesting: timeout.nesting
    });
    active.set(timeout.id, timeout);
    queue.push({
      timeout,
      dueAt: timeout.dueAt,
      sequence
    });
    const isCrowded = queue.size > active.size * 2 + STALE_ENTRY_ALLOWANCE;
    if (isCrowded) {
      queue.keepOnly(isLive);
    }

    arm();
  }

  function stop(timeout: Timeout) {
    timeout.isActive = false;
    active.delete(timeout.id);
  }

  const host = {
    start,
    stop
  };

  function runCallback({ invoke, level }: {
    invoke: () => void;
    level: number;
  }) {
    const outer = nesting;
    nesting = level;
    try {
      invoke();
    } catch (error) {
      rethrowLater(error);
    } finally {
      nesting = outer;
    }
  }

  function fire(timeout: Timeout) {
    const firedSequence = timeout.sequence;
    if (!timeout.isRepeating) {
      stop(timeout);
    }

    runCallback({
      invoke: () => timeout.invoke(timeout),
      level: timeout.nesting
    });
    const isRescheduled = timeout.sequence !== firedSequence;
    const shouldRepeat = timeout.isRepeating && timeout.isActive && !isRescheduled;
    if (shouldRepeat) {
      timeout.nesting += 1;
      start(timeout);
    }
  }

  function run() {
    armedDueAt = undefined;
    isRunning = true;
    const now = driver.now();
    try {
      for (let entry = nextLive(); entry !== undefined && entry.dueAt <= now; entry = nextLive()) {
        queue.pop();
        fire(entry.timeout);
      }
    } finally {
      isRunning = false;
      arm();
    }
  }

  function queueDrain() {
    const isBlocked = isDrainQueued || isStopped;
    if (isBlocked) {
      return;
    }

    isDrainQueued = true;
    driver.enqueue(drain);
  }

  function drain() {
    isDrainQueued = false;
    const batch = immediates;
    immediates = [];
    for (const immediate of batch) {
      if (immediate.isActive) {
        immediate.isActive = false;
        runCallback({
          invoke: () => immediate.invoke(immediate),
          level: 0
        });
      }
    }

    const hasMore = immediates.length > 0;
    if (hasMore) {
      queueDrain();
    }
  }

  function createTimeout<T extends unknown[]>({ callback, delay, args, isRepeating }: {
    callback: (...args: T) => void;
    delay: unknown;
    args: T;
    isRepeating: boolean;
  }) {
    assertCallback(callback);
    const timeout = new Timeout({
      id: nextId,
      invoke: self => callback.apply(self, args),
      delay: normalizedDelay(delay),
      nesting: nesting + 1,
      isRepeating,
      host
    });
    nextId += 1;
    start(timeout);
    return timeout;
  }

  function clearTimer(timer: unknown) {
    const isTimeout = timer instanceof Timeout;
    if (isTimeout) {
      stop(timer);
      return;
    }

    const isId = typeof timer === "number" || typeof timer === "string";
    const found = isId ? active.get(Number(timer)) : undefined;
    const isFound = found !== undefined;
    if (isFound) {
      stop(found);
    }
  }

  return {
    /** `setTimeout`: runs `callback` with `args` once, after `delay` milliseconds. */
    setTimeout<T extends unknown[]>(callback: (...args: T) => void, delay?: number, ...args: T) {
      return createTimeout({
        callback,
        delay,
        args,
        isRepeating: false
      });
    },
    /** `setInterval`: runs `callback` with `args` every `delay` milliseconds until cleared. */
    setInterval<T extends unknown[]>(callback: (...args: T) => void, delay?: number, ...args: T) {
      return createTimeout({
        callback,
        delay,
        args,
        isRepeating: true
      });
    },
    /** `setImmediate`: runs `callback` on the next turn, after the work already queued. */
    setImmediate<T extends unknown[]>(callback: (...args: T) => void, ...args: T) {
      assertCallback(callback);
      const immediate = new Immediate(self => callback.apply(self, args));
      if (isStopped) {
        immediate.isActive = false;
        return immediate;
      }

      immediates.push(immediate);
      queueDrain();
      return immediate;
    },
    /** `clearTimeout` and `clearInterval`: take the object `setTimeout` returned, or its id. */
    clearTimeout: clearTimer,
    /** Same as `clearTimeout`. */
    clearInterval: clearTimer,
    /** `clearImmediate`. */
    clearImmediate(immediate: unknown) {
      const isImmediate = immediate instanceof Immediate;
      if (isImmediate) {
        immediate.isActive = false;
      }
    },
    /**
     * Cancels every timer and immediate, and refuses new ones until
     * `reattach`: the application is ending and what it scheduled must not
     * run against windows that are gone.
     */
    stopAll() {
      for (const timeout of active.values()) {
        timeout.isActive = false;
      }

      for (const immediate of immediates) {
        immediate.isActive = false;
      }

      active.clear();
      queue.clear();
      immediates = [];
      isStopped = true;
      armedDueAt = undefined;
      driver.disarm();
    },
    /** The driver now sits on another clock or queue: sets the alarm and the queue again from what is pending. */
    reattach() {
      isStopped = false;
      armedDueAt = undefined;
      isDrainQueued = false;
      arm();
      const hasImmediates = immediates.length > 0;
      if (hasImmediates) {
        queueDrain();
      }
    }
  };
}

/** A scheduler: what `createScheduler` returns. */
export type Scheduler = ReturnType<typeof createScheduler>;
