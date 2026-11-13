import type { Linker } from "./runtime.svelte.ts";

// State the app only reads. A function of its own rather than a Linker method,
// so an app that uses no control with observed state does not bundle it.

/**
 * Holds a control's read-only state in a bound prop: the value as soon as the
 * control is linked, and again each time one of `subscribers`' events says it
 * changed. Nothing the prop holds is written to the control.
 */
export function observe<Bound extends object, Key extends keyof Bound>({ link, bound, key, read, subscribers }: {
  link: Linker;
  bound: Bound;
  key: Key;
  read: () => Bound[Key];
  subscribers: readonly ((handler: () => void) => () => void)[];
}) {
  function publish() {
    const current = read();
    const isChanged = current !== bound[key];
    if (isChanged) {
      bound[key] = current;
    }
  }

  publish();
  for (const subscribe of subscribers) {
    link.add(subscribe(publish));
  }
}
