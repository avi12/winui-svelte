import { DispatcherQueue } from "./winui.ts";
import { flushSync } from "svelte";

// Updates are flushed by hand, and on WinUI's dispatcher. WinUI's loop holds
// the UI thread, so Node's microtasks (where Svelte schedules its own flush)
// have no turn to run in: whoever changes state calls flush(), and state that
// arrives from elsewhere arrives through dispatch().

const flushListeners = new Set<() => void>();

/**
 * Applies pending state changes at once: Svelte's `flushSync()`, then every
 * `onFlush` listener.
 */
export function flush() {
  flushSync();
  for (const listener of flushListeners) {
    listener();
  }
}

/**
 * Registers a listener for parts that must act after Svelte has applied a
 * batch of changes (the CSS runtime).
 *
 * @param listener - Called after every flush.
 * @returns A function that removes the listener.
 */
export function onFlush(listener: () => void) {
  flushListeners.add(listener);
  return () => {
    flushListeners.delete(listener);
  };
}

/**
 * Takes this thread's dispatcher queue (call it on the UI thread, the only
 * one with a queue to get) and returns what puts work on it from any thread.
 * For a native event that may be raised off the UI thread, such as the
 * system settings'.
 *
 * @returns A function that runs its work on the UI thread, then flushes. It
 *   returns false when the queue is shutting down and the work will not run.
 */
export function uiThreadDispatcher() {
  const queue = DispatcherQueue.getForCurrentThread();
  return (work: () => void) => queue.tryEnqueue(() => {
    work();
    flush();
  });
}

/**
 * Runs `work` on the UI thread's dispatcher queue, then flushes. Called on
 * the UI thread, the only one with a queue to get.
 *
 * @param work - What to run on the UI thread.
 * @throws {Error} When the dispatcher queue is shutting down.
 */
export function dispatch(work: () => void) {
  const isQueued = uiThreadDispatcher()(work);
  if (!isQueued) {
    throw new Error("the UI thread's dispatcher queue is shutting down");
  }
}
