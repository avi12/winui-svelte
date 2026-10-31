/** What orders a queued entry: when it is due, then the order it was queued in. */
export interface QueueEntry {
  readonly dueAt: number;
  readonly sequence: number;
}

function isBefore({ first, second }: {
  first: QueueEntry;
  second: QueueEntry;
}) {
  const isSameTime = first.dueAt === second.dueAt;
  if (isSameTime) {
    return first.sequence < second.sequence;
  }

  return first.dueAt < second.dueAt;
}

/**
 * Entries in due order, the earliest taken first. Kept as an array with the
 * latest first, so taking the earliest is `pop` and a push is one binary
 * search and one move, which is cheaper than a heap for the thousands of timers
 * an app holds.
 */
export class TimerQueue<T extends QueueEntry> {
  private items: T[] = [];

  get size() {
    return this.items.length;
  }

  peek() {
    return this.items.at(-1);
  }

  pop() {
    return this.items.pop();
  }

  push(entry: T) {
    let low = 0;
    let high = this.items.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      const existing = this.items[middle];
      const isEarlier = existing !== undefined && isBefore({
        first: existing,
        second: entry
      });
      if (isEarlier) {
        high = middle;
      } else {
        low = middle + 1;
      }
    }

    this.items.splice(low, 0, entry);
  }

  keepOnly(isKept: (entry: T) => boolean) {
    this.items = this.items.filter(isKept);
  }

  clear() {
    this.items = [];
  }
}
