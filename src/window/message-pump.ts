// The UI thread's loop: WinUI's messages and libuv's callbacks, turn by turn.
// `Application.Start` blocks in a message loop of its own, inside a libuv
// callback, so the thread's libuv never turns again; here the loop is ours: a
// slice dispatches one message, then hands the thread back to libuv for a turn
// (an immediate), and so on. One message per slice, so the promise
// continuations a handler queued run before the next message is handled, as
// they do for a browser's events. A message is first offered to the content
// that owns the keyboard (`dispatchNextMessage`), as WinUI's own loop does.
// When no message is waiting the slice sleeps in the message wait, which ends
// the moment one arrives. How long it may sleep is the source's to say when it
// can hear libuv too (`idleMilliseconds`, see libuv-wake.ts): an idle window
// then sleeps until something happens and costs nothing. A source that cannot
// polls: the sleep doubles from one millisecond to a cap while nothing
// happens, so libuv's answers (a socket, a file read, a child process) are late
// by the cap at most, and an idle window costs a wake-up every cap
// milliseconds.

const FIRST_SLEEP_MILLISECONDS = 1;
const MAXIMUM_SLEEP_MILLISECONDS = 8;
const BACKOFF_FACTOR = 2;

/** What `MessageSource.dispatchNext` found. */
export const Dispatched = {
  NOTHING: "nothing",
  MESSAGE: "message",
  QUIT: "quit"
} as const;

/** One of the `Dispatched` values. */
export type Dispatched = typeof Dispatched[keyof typeof Dispatched];

/** Where the thread's messages come from. */
export interface MessageSource {
  /** Dispatches the message that is waiting, if any, without blocking. */
  dispatchNext(): Dispatched;

  /**
   * Blocks until a message is waiting or `milliseconds` have passed (or, when
   * the source hears libuv, until libuv has work).
   */
  wait(milliseconds: number): void;

  /** How long an idle thread may sleep; absent when the source cannot hear libuv and the pump polls. */
  idleMilliseconds?: (() => number) | undefined;
}

/** The thread's Win32 queue, one message at a time. */
export interface MessageQueue {
  /** Removes the next message from the queue into the buffer the other methods read; false when none is waiting. */
  take(): boolean;

  /** Whether the message taken is the quit message. */
  isQuit(): boolean;

  /** Offers the message taken to the message hooks (message-hooks.ts); true when one handled it. */
  isHandledByHook(): boolean;

  /**
   * Offers the message taken to the content that owns the keyboard
   * (`ContentPreTranslateMessage`): accelerators, access keys, focus
   * navigation and the Text Services Framework are handled there. True when
   * it consumed the message.
   */
  isConsumedByContent(): boolean;

  /** `TranslateMessage` then `DispatchMessage` for the message taken. */
  deliver(): void;
}

/**
 * Handles the next message of `queue` the way WinUI's own loop does: the
 * hooks and then the content see it first, and only a message it left alone is translated
 * (WM_KEYDOWN to WM_CHAR) and dispatched.
 */
export function dispatchNextMessage(queue: MessageQueue) {
  const isEmpty = !queue.take();
  if (isEmpty) {
    return Dispatched.NOTHING;
  }

  if (queue.isQuit()) {
    return Dispatched.QUIT;
  }

  if (queue.isHandledByHook()) {
    return Dispatched.MESSAGE;
  }

  if (!queue.isConsumedByContent()) {
    queue.deliver();
  }

  return Dispatched.MESSAGE;
}

/** What `createMessagePump` is made of. */
export interface MessagePumpOptions {
  source: MessageSource;

  /** Runs `callback` on libuv's next turn, after the I/O that is ready. */
  schedule: (callback: () => void) => void;

  /** Called once, when the quit message has been dispatched. */
  onQuit: () => void;
}

/**
 * A pump that alternates the thread's messages with libuv's turns. `start`
 * runs the first slice at once; the pump stops itself at the quit message or
 * when `stop` is called, and then schedules nothing more, so the loop it kept
 * alive can end.
 */
export function createMessagePump({ source, schedule, onQuit }: MessagePumpOptions) {
  let isRunning = false;
  let sleepMilliseconds = FIRST_SLEEP_MILLISECONDS;

  function sleep() {
    const idleMilliseconds = source.idleMilliseconds?.();
    const isHeard = idleMilliseconds !== undefined;
    if (isHeard) {
      source.wait(idleMilliseconds);
      return;
    }

    source.wait(sleepMilliseconds);
    sleepMilliseconds = Math.min(sleepMilliseconds * BACKOFF_FACTOR, MAXIMUM_SLEEP_MILLISECONDS);
  }

  function slice() {
    if (!isRunning) {
      return;
    }

    try {
      const found = source.dispatchNext();
      const isQuit = found === Dispatched.QUIT;
      if (isQuit) {
        isRunning = false;
        onQuit();
        return;
      }

      const isMessage = found === Dispatched.MESSAGE;
      if (isMessage) {
        sleepMilliseconds = FIRST_SLEEP_MILLISECONDS;
        return;
      }

      sleep();
    } finally {
      if (isRunning) {
        schedule(slice);
      }
    }
  }

  return {
    /** Runs the first slice now. */
    start() {
      if (isRunning) {
        return;
      }

      isRunning = true;
      slice();
    },
    /** Ends the pump after the slice that is running, if any. */
    stop() {
      isRunning = false;
    },
    /** Whether slices are still being scheduled. */
    get isRunning() {
      return isRunning;
    }
  };
}
