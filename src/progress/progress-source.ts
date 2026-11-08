import type { ProgressSnapshot, ProgressState } from "./progress-state.ts";
import { createSubscriber } from "svelte/reactivity";

/** The event both an operation and the registry fire after any change of their snapshot. */
export const CHANGE_EVENT = "change";

/**
 * Anything with a progress to show: one `ProgressOperation` or a
 * `ProgressRegistry`. It is an `EventTarget` that fires `change`, a Svelte
 * store (`$source`), and its getters are reactive in a component or `$effect`.
 */
export interface ProgressSource extends EventTarget {
  /** The latest state; the same object until something changes. */
  readonly snapshot: ProgressSnapshot;

  /**
   * Calls `run` with the snapshot now and after every change.
   *
   * @param run - The listener.
   * @returns Stops the calls.
   */
  subscribe(run: (snapshot: ProgressSnapshot) => void): () => void;
}

/**
 * The `subscribe` of a source: the store contract over its `change` event.
 *
 * @param options - The source and the listener.
 * @returns Stops the calls.
 */
export function subscribeTo({ source, run }: {
  source: ProgressSource;
  run: (snapshot: ProgressSnapshot) => void;
}) {
  function listener() {
    run(source.snapshot);
  }

  source.addEventListener(CHANGE_EVENT, listener);
  run(source.snapshot);
  return () => source.removeEventListener(CHANGE_EVENT, listener);
}

/**
 * Makes a source getters reactive: call the result inside each getter.
 * Outside an effect, and under Node, it does nothing.
 *
 * @param source - The source whose `change` events invalidate a reader.
 * @returns The function to call before reading.
 */
export function reactiveReads(source: EventTarget) {
  return createSubscriber(update => {
    source.addEventListener(CHANGE_EVENT, update);
    return () => source.removeEventListener(CHANGE_EVENT, update);
  });
}

/** An operation as the registry sees it, whatever it resolves to. */
export interface TrackedOperation extends ProgressSource {
  readonly group: string | undefined;
  readonly state: ProgressState;
  readonly label: string | undefined;

  /** Stops the operation. */
  cancel(reason?: unknown): void;
}
