import type { OverlayBound } from "./overlay-host.svelte.ts";
import { flushSync } from "svelte";

/**
 * The component's `open` as reactive state, which the host reads and writes
 * the way a bound prop is.
 *
 * @returns The state, with `open` unset.
 */
export function openState() {
  const state = $state<OverlayBound>({ open: undefined });
  return state;
}

/**
 * Runs `create` in an effect root, so the host's effects run, and flushes them.
 *
 * @param create - Makes what the test attaches.
 * @returns What `create` returned, and what ends the effects.
 */
export function inEffectRoot<Result>(create: () => Result) {
  let result: Result | undefined;
  const stop = $effect.root(() => {
    result = create();
  });
  flushSync();
  return {
    result,
    stop
  };
}
