import { createMatchMedia } from "./match-media.ts";
import type { MediaQueryList } from "./match-media.ts";
import { systemMediaStore } from "./media-store.ts";
import type { MediaStore } from "#src/css/media/features.js";
import { createSubscriber } from "svelte/reactivity";

/** A media query that holds or not, reactive. */
export interface ReactiveMediaQuery {
  /**
   * Whether the query holds now; read it in markup, `$derived` or `$effect` and
   * it updates as Windows' settings or the window change.
   */
  readonly matches: boolean;
}

/**
 * Makes the reactive query over a media store: `mediaQuery` is this over the
 * machine's settings.
 *
 * @param options - The store and the query.
 * @returns The reactive query.
 */
export function observeMediaQuery({ store, query }: {
  store: MediaStore;
  query: string;
}) {
  const list: MediaQueryList = createMatchMedia(store)(query);
  const subscribe = createSubscriber(update => {
    list.addEventListener("change", update);
    return () => {
      list.removeEventListener("change", update);
    };
  });
  return {
    get matches() {
      subscribe();
      return list.matches;
    }
  } satisfies ReactiveMediaQuery;
}

/**
 * A reactive boolean for a media query, such as
 * `mediaQuery("(prefers-reduced-motion: reduce)")`: the same queries a
 * stylesheet's `@media` takes, answered from the same settings. Call it on
 * the UI thread, in a `.svelte` script or a `.svelte.ts` module.
 *
 * @param query - A media query list.
 * @returns The reactive query.
 */
export function mediaQuery(query: string) {
  return observeMediaQuery({
    store: systemMediaStore(),
    query
  });
}
