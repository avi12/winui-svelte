import type { Readable, Writable } from "svelte/store";

interface Tally {
  active: number;
  total: number;
}

export function metered<T>(source: Readable<T>) {
  const tally: Tally = {
    active: 0,
    total: 0
  };
  function subscribe(...[run]: Parameters<Readable<T>["subscribe"]>) {
    tally.active++;
    tally.total++;
    const stop = source.subscribe(run);
    return () => {
      tally.active--;
      stop();
    };
  }

  return {
    subscribe,
    tally
  };
}

export function meteredWritable<T>(source: Writable<T>) {
  return {
    ...metered(source),
    set: source.set,
    update: source.update
  };
}
