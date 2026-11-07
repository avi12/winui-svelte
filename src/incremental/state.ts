/** Where an incremental source is: what it is doing, and whether there is more. */
export const IncrementalStatus = {
  /** Nothing is loading; the next batch loads when the list nears its end. */
  IDLE: "idle",
  /** A batch is loading. */
  LOADING: "loading",
  /** The last batch failed; `retry()` tries it again. */
  ERROR: "error",
  /** The source has no more items. */
  DONE: "done"
} as const;

/** One of `IncrementalStatus`'s values. */
export type IncrementalStatus = (typeof IncrementalStatus)[keyof typeof IncrementalStatus];

/** The state of an incremental source: `error` is there only in the failed state. */
export type IncrementalState =
  | { readonly status: typeof IncrementalStatus.IDLE }
  | { readonly status: typeof IncrementalStatus.LOADING }
  | {
    readonly status: typeof IncrementalStatus.ERROR;
    readonly error: Error;
  }
  | { readonly status: typeof IncrementalStatus.DONE };

/**
 * What a list component asks of its `incremental` prop: told which item
 * index the control realized, it loads more when that is near the end.
 */
export interface IncrementalLoading {
  /** The control realized the item at `index` (zero when the list starts). */
  realized({ index }: { index: number }): void;
}
