import type { MediaStoreOptions } from "./media-store.ts";
import { systemMediaStore } from "./media-store.ts";
import type { MediaStore } from "#src/css/media/features.js";
import { changesOf, mediaListMatches, normalizedMedia, parseMediaList } from "#src/css/media/query.js";

/** What a `change` listener of a `MediaQueryList` receives. */
export interface MediaQueryChange {
  readonly type: "change";
  readonly matches: boolean;
  readonly media: string;
}

type ChangeListener = ((event: MediaQueryChange) => void) | { handleEvent(event: MediaQueryChange): void };

function callListener({ listener, event }: {
  listener: ChangeListener;
  event: MediaQueryChange;
}) {
  const isFunction = typeof listener === "function";
  if (isFunction) {
    listener(event);
    return;
  }

  listener.handleEvent(event);
}

/**
 * The web's `MediaQueryList`: whether a media query holds now, and a
 * `change` event when that flips. It listens to Windows only while it has a
 * listener.
 */
export class MediaQueryList {
  /** The query, normalised. */
  readonly media: string;

  private readonly store: MediaStore;
  private readonly parsed: ReturnType<typeof parseMediaList>;
  private readonly listeners = new Set<ChangeListener>();
  private stop: (() => void) | null = null;
  private isMatching = false;
  private handler: ((event: MediaQueryChange) => void) | null = null;

  constructor({ query, store }: {
    query: string;
    store: MediaStore;
  }) {
    this.media = normalizedMedia(query);
    this.store = store;
    this.parsed = parseMediaList(query);
  }

  /** Whether the query holds now; read live. */
  get matches() {
    return mediaListMatches({
      parsed: this.parsed,
      inputs: this.store.inputs
    });
  }

  /** The handler of the `change` event, as the web has it. */
  get onchange() {
    return this.handler;
  }

  set onchange(handler: ((event: MediaQueryChange) => void) | null) {
    this.handler = handler;
    const isRemoved = handler === null;
    if (isRemoved) {
      this.unlistenIfIdle();
      return;
    }

    this.listen();
  }

  /** Adds a `change` listener. */
  // eslint-disable-next-line no-restricted-syntax -- the web's signature
  addEventListener(type: string, listener: ChangeListener | null) {
    const isChange = type === "change" && listener !== null;
    if (!isChange) {
      return;
    }

    this.listeners.add(listener);
    this.listen();
  }

  /** Removes a `change` listener. */
  // eslint-disable-next-line no-restricted-syntax -- the web's signature
  removeEventListener(type: string, listener: ChangeListener | null) {
    const isChange = type === "change" && listener !== null;
    if (!isChange) {
      return;
    }

    this.listeners.delete(listener);
    this.unlistenIfIdle();
  }

  /** The legacy form of `addEventListener("change", listener)`. */
  addListener(listener: ChangeListener | null) {
    this.addEventListener("change", listener);
  }

  /** The legacy form of `removeEventListener("change", listener)`. */
  removeListener(listener: ChangeListener | null) {
    this.removeEventListener("change", listener);
  }

  // `onchange` is a property, so a listener may be set without a call: it is
  // looked at when a change may have happened.
  private listen() {
    const isListening = this.stop !== null;
    if (isListening) {
      return;
    }

    this.isMatching = this.matches;
    this.stop = this.store.subscribe({
      changes: changesOf(this.parsed),
      callback: () => {
        this.check();
      }
    });
  }

  private unlistenIfIdle() {
    const isIdle = this.listeners.size === 0 && this.handler === null;
    if (isIdle) {
      this.stop?.();
      this.stop = null;
    }
  }

  private check() {
    const { matches: isNowMatching } = this;
    const isChanged = isNowMatching !== this.isMatching;
    if (!isChanged) {
      return;
    }

    this.isMatching = isNowMatching;
    const event = {
      type: "change",
      matches: isNowMatching,
      media: this.media
    } satisfies MediaQueryChange;
    this.handler?.(event);
    for (const listener of this.listeners) {
      callListener({
        listener,
        event
      });
    }
  }
}

/**
 * Makes a `matchMedia` over a media store: the same query evaluator the CSS
 * `@media` rules run through, answering from the same settings.
 *
 * @param store - Where the answers come from.
 * @returns A function that makes a `MediaQueryList` of a query.
 */
export function createMatchMedia(store: MediaStore) {
  return (query: string) => new MediaQueryList({
    query,
    store
  });
}

/** What `installMatchMedia` can be told: other answers than the defaults, or a whole store of them. */
export type InstallOptions = Omit<MediaStoreOptions, "settings"> & { store?: MediaStore };

/**
 * The web's `window.matchMedia` over Windows' settings, on the machine's
 * settings. Call it on the UI thread.
 *
 * @param query - A media query list, such as `(prefers-reduced-motion: reduce)`.
 * @returns The list: `matches` now, and a `change` event as it flips.
 */
export function matchMedia(query: string) {
  return createMatchMedia(systemMediaStore())(query);
}

/**
 * Makes `matchMedia` a global (and `window.matchMedia` where there is a
 * `window`), so libraries that call it, such as Svelte's `MediaQuery`
 * from `svelte/reactivity`, work unmodified. Nothing is installed at import
 * time: call this once, on the UI thread.
 *
 * @param options - Other answers than the defaults (a window's size and scale, the devices), or a whole store.
 * @returns A function that takes it away again.
 */
export function installMatchMedia({ store, ...options }: InstallOptions = {}) {
  const target = store ?? systemMediaStore(options);
  const host: {
    matchMedia?: unknown;
    window?: { matchMedia?: unknown };
  } = globalThis;
  const previous = host.matchMedia;
  const previousWindow = host.window?.matchMedia;
  const installed = createMatchMedia(target);
  host.matchMedia = installed;

  const { window: appWindow } = host;
  const hasWindow = appWindow !== undefined;
  if (hasWindow) {
    appWindow.matchMedia = installed;
  }

  return () => {
    host.matchMedia = previous;

    if (hasWindow) {
      appWindow.matchMedia = previousWindow;
    }
  };
}
