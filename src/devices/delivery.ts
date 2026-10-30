import { flush, uiThreadDispatcherIfReady } from "#src/scheduling.js";

/**
 * How a native event reaches Svelte state: a function that runs the work it
 * is given on the thread that owns the state. WinRT raises its events on
 * threads of its own, so a rune hands each change to its delivery.
 */
export type Delivery = (work: () => void) => void;

/**
 * Runs the work where the call is made, then applies the state changes it
 * made. For a program with no window and a test; in a window use the
 * default, which runs on the UI thread.
 *
 * @param work - What changes state.
 */
export function deliverNow(work: () => void) {
  work();
  flush();
}

/**
 * The delivery a rune uses when it is not given one: the UI thread's
 * dispatcher queue when this thread has one (call the rune on the UI thread),
 * `deliverNow` otherwise.
 *
 * @returns A delivery.
 */
export function defaultDelivery() {
  return uiThreadDispatcherIfReady() ?? deliverNow;
}
