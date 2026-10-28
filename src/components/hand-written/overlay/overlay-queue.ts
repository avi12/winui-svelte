// WinUI shows one ContentDialog at a time: a second ShowAsync while one is
// open fails (0x80000019). The queue is what turns "open" on two dialogs into
// two dialogs, one after the other.

interface Turn {
  run(): Promise<void>;
}

/** A place in the queue: what the dialog answered, and a way to give the place up. */
export interface QueueTicket<Result> {
  /** Resolves with what `show` did, or with `undefined` when the ticket was cancelled before its turn. */
  readonly result: Promise<Result | undefined>;
  /** Gives up the place. Returns whether the turn had not come yet (false: it is showing or done). */
  cancel(): boolean;
}

/** Runs the dialogs it is given one after another, in the order they were asked for. */
export class OverlayQueue {
  private readonly waiting: Turn[] = [];
  private isShowing = false;

  /**
   * Asks for a turn. `show` runs when every earlier turn has ended, whether
   * it resolved or failed; a failure of `show` rejects `result` and does not
   * hold the next turn back.
   *
   * @param options - What shows the dialog.
   * @returns The ticket for this turn.
   */
  enqueue<Result>({ show }: { show: () => Promise<Result> }) {
    const { promise, resolve, reject } = Promise.withResolvers<Result | undefined>();
    const turn: Turn = {
      async run() {
        try {
          resolve(await show());
        } catch (error) {
          reject(error);
        }
      }
    };
    this.waiting.push(turn);
    void this.drain();
    return {
      result: promise,
      cancel: () => {
        const iTurn = this.waiting.indexOf(turn);
        const isWaiting = iTurn !== -1;
        if (isWaiting) {
          this.waiting.splice(iTurn, 1);
          resolve(undefined);
        }

        return isWaiting;
      }
    };
  }

  private async drain() {
    if (this.isShowing) {
      return;
    }

    this.isShowing = true;
    for (let turn = this.waiting.shift(); turn !== undefined; turn = this.waiting.shift()) {
      await turn.run();
    }

    this.isShowing = false;
  }
}

let sharedQueue: OverlayQueue | null = null;

/**
 * The queue every ContentDialog of this thread goes through. WinUI's limit is
 * per window, but one queue per thread is simple and never shows two at once;
 * a dialog of a second window waits for the first window's dialog.
 *
 * @returns The thread's queue, made the first time it is asked for.
 */
export function dialogQueue() {
  sharedQueue ??= new OverlayQueue();
  return sharedQueue;
}
