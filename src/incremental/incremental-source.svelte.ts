import type { IncrementalLoading, IncrementalState } from "./state.ts";
import { IncrementalStatus } from "./state.ts";

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_THRESHOLD = 5;

/** What `createIncrementalSource` takes. */
export interface IncrementalSourceOptions<Item> {
  /**
   * Loads the next batch: `count` items from `offset` on. Fewer than `count`
   * means the last batch. Stop work when `signal` aborts (`reset()`,
   * `cancel()`, `dispose()`); the result of an aborted load is dropped anyway.
   */
  load({ offset, count, signal }: {
    offset: number;
    count: number;
    signal: AbortSignal;
  }): Promise<readonly Item[]>;
  /** The size of a batch; 20 by default. */
  batchSize?: number;
  /** Loads the next batch when a realized item is within this many of the end; 5 by default. */
  threshold?: number;
  /**
   * Tells the last batch when its size cannot (a server that sends a cursor).
   * By default a batch shorter than `batchSize` is the last; an empty one
   * always is.
   */
  isLast?({ batch, items }: {
    batch: readonly Item[];
    items: readonly Item[];
  }): boolean;
}

function errorOf(thrown: unknown) {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}

/**
 * Items that arrive in batches as a list nears its end: `items` for the
 * list's `items`, `state` for a footer, and the list's `incremental` prop.
 */
export class IncrementalSource<Item> implements IncrementalLoading {
  private readonly options: IncrementalSourceOptions<Item>;
  private readonly batchSize: number;
  private readonly threshold: number;
  private loaded = $state.raw<readonly Item[]>([]);
  private current = $state.raw<IncrementalState>({ status: IncrementalStatus.IDLE });
  private controller: AbortController | undefined;
  private running: Promise<void> | undefined;

  constructor(options: IncrementalSourceOptions<Item>) {
    this.options = options;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.threshold = options.threshold ?? DEFAULT_THRESHOLD;
    const isBatchValid = Number.isInteger(this.batchSize) && this.batchSize >= 1;
    if (!isBatchValid) {
      throw new RangeError(`batchSize must be a positive integer, got ${this.batchSize}`);
    }
  }

  /** The items loaded so far, in order. Reactive. */
  get items() {
    return this.loaded;
  }

  /** What the source is doing. Reactive. */
  get state() {
    return this.current;
  }

  /**
   * Loads the next batch, unless one is loading (then it is that load's
   * promise), the source is done, or the last load failed (`retry()`). Never
   * rejects: a failure is the `error` state.
   */
  loadMore() {
    const isLoading = this.current.status === IncrementalStatus.LOADING;
    if (isLoading) {
      return this.running ?? Promise.resolve();
    }

    const isIdle = this.current.status === IncrementalStatus.IDLE;
    if (!isIdle) {
      return Promise.resolve();
    }

    const controller = new AbortController();
    this.controller = controller;
    this.current = { status: IncrementalStatus.LOADING };
    const running = this.fetchBatch(controller);
    this.running = running;
    return running;
  }

  /** Tries the failed batch again; does nothing in any other state. */
  retry() {
    const isFailed = this.current.status === IncrementalStatus.ERROR;
    if (!isFailed) {
      return Promise.resolve();
    }

    this.current = { status: IncrementalStatus.IDLE };
    return this.loadMore();
  }

  /** Drops the load in flight; the source is idle and may load again. */
  cancel() {
    this.controller?.abort();
    this.controller = undefined;
    this.running = undefined;
    const isLoading = this.current.status === IncrementalStatus.LOADING;
    if (isLoading) {
      this.current = { status: IncrementalStatus.IDLE };
    }
  }

  /** Drops the load in flight and every item; a list bound to the source loads the first batch again. */
  reset() {
    this.cancel();
    this.loaded = [];
    this.current = { status: IncrementalStatus.IDLE };
  }

  /** Stops loading for good: aborts the load in flight. */
  dispose() {
    this.cancel();
  }

  realized({ index }: { index: number }) {
    const isIdle = this.current.status === IncrementalStatus.IDLE;
    const isNearEnd = index >= this.loaded.length - this.threshold;
    const shouldLoad = isIdle && isNearEnd;
    if (shouldLoad) {
      void this.loadMore();
    }
  }

  private async fetchBatch(controller: AbortController) {
    const { signal } = controller;
    try {
      const batch = await this.options.load({
        offset: this.loaded.length,
        count: this.batchSize,
        signal
      });
      if (signal.aborted) {
        return;
      }

      this.loaded = [...this.loaded, ...batch];
      const isLast = batch.length === 0 || (this.options.isLast?.({
        batch,
        items: this.loaded
      }) ?? batch.length < this.batchSize);
      this.current = { status: isLast ? IncrementalStatus.DONE : IncrementalStatus.IDLE };
    } catch (thrown) {
      if (!signal.aborted) {
        this.current = {
          status: IncrementalStatus.ERROR,
          error: errorOf(thrown)
        };
      }
    } finally {
      const isCurrent = this.controller === controller;
      if (isCurrent) {
        this.controller = undefined;
        this.running = undefined;
      }
    }
  }
}

/**
 * Makes an incremental source: `items` grows by `batchSize` whenever the list
 * it is bound to realizes an item near the end.
 *
 * @returns The source: pass `items` as the list's `items` and the source as its `incremental`.
 */
export function createIncrementalSource<Item>(options: IncrementalSourceOptions<Item>) {
  return new IncrementalSource(options);
}
