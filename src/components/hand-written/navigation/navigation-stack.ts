/**
 * How long a page the user left stays mounted, as WinUI's
 * `NavigationCacheMode` says of a `Page`.
 */
export const NavigationCacheMode = {
  // Ends when the user leaves it; coming back makes a new one.
  DISABLED: "disabled",
  // Stays while it is among the most recently shown (`cacheSize` of them).
  ENABLED: "enabled",
  // Stays for as long as it is in the history, whatever the cache size.
  REQUIRED: "required"
} as const;

/** One of the cache modes. */
export type NavigationCacheMode = (typeof NavigationCacheMode)[keyof typeof NavigationCacheMode];

/** How the user got to a page, as WinUI's `NavigationMode`. */
export const NavigationMode = {
  NEW: "new",
  BACK: "back",
  FORWARD: "forward"
} as const;

/** One of the navigation modes. */
export type NavigationMode = (typeof NavigationMode)[keyof typeof NavigationMode];

/** The cache size WinUI's `Frame` starts with. */
export const DEFAULT_CACHE_SIZE = 10;

/** What the history needs to know of a page it holds. */
export interface StackEntry {
  readonly cacheMode: NavigationCacheMode;
}

/** What one step through the history did. */
export interface StackChange<Entry> {
  readonly mode: NavigationMode;
  readonly from: Entry | null;
  readonly to: Entry;
  // The entries that were mounted and must end now: the ones the history no
  // longer holds, and the ones the cache lets go of.
  readonly released: readonly Entry[];
}

/**
 * The back and forward history of a frame, and which of its pages stay
 * mounted. It holds entries, not pages: what an entry is, and how it is
 * mounted, is the caller's.
 */
export class NavigationStack<Entry extends StackEntry> {
  private readonly back: Entry[] = [];
  // The next page to go forward to is the last.
  private readonly forward: Entry[] = [];
  private present: Entry | null = null;
  // The entries that are mounted, each with when it was last shown.
  private readonly mounted = new Map<Entry, number>();
  private visits = 0;
  private readonly cacheSize: () => number;

  constructor({ cacheSize = () => DEFAULT_CACHE_SIZE }: { cacheSize?: () => number } = {}) {
    this.cacheSize = cacheSize;
  }

  /** The page being shown, or null before the first navigation. */
  get current() {
    return this.present;
  }

  /** Whether `goBack` has a page to go to. */
  get canGoBack() {
    return this.back.length > 0;
  }

  /** Whether `goForward` has a page to go to. */
  get canGoForward() {
    return this.forward.length > 0;
  }

  /** Whether the entry is mounted now, and so keeps its state. */
  isMounted(entry: Entry) {
    return this.mounted.has(entry);
  }

  /** Goes to a new page; the pages that were forward of the current one are dropped. */
  navigate(entry: Entry) {
    const from = this.present;
    if (from !== null) {
      this.back.push(from);
    }

    return this.show({
      mode: NavigationMode.NEW,
      from,
      to: entry,
      dropped: this.forward.splice(0)
    });
  }

  /** Goes back one page, or does nothing (null) when there is none. */
  goBack() {
    const to = this.back.pop();
    const from = this.present;
    const hasPage = to !== undefined && from !== null;
    if (!hasPage) {
      return null;
    }

    this.forward.push(from);
    return this.show({
      mode: NavigationMode.BACK,
      from,
      to,
      dropped: []
    });
  }

  /** Goes forward one page, or does nothing (null) when there is none. */
  goForward() {
    const to = this.forward.pop();
    const from = this.present;
    const hasPage = to !== undefined && from !== null;
    if (!hasPage) {
      return null;
    }

    this.back.push(from);
    return this.show({
      mode: NavigationMode.FORWARD,
      from,
      to,
      dropped: []
    });
  }

  private show({ mode, from, to, dropped }: {
    mode: NavigationMode;
    from: Entry | null;
    to: Entry;
    dropped: readonly Entry[];
  }) {
    this.present = to;
    this.visits++;
    this.mounted.set(to, this.visits);
    const released = [...dropped.filter(entry => this.mounted.delete(entry)), ...this.evict(to)];
    return {
      mode,
      from,
      to,
      released
    } satisfies StackChange<Entry>;
  }

  // The mounted entries other than the one shown that the cache lets go of:
  // the disabled ones, and the enabled ones past the cache size, oldest first.
  private evict(shown: Entry) {
    const others = [...this.mounted].filter(([entry]) => entry !== shown);
    const enabled = others
      .filter(([entry]) => entry.cacheMode === NavigationCacheMode.ENABLED)
      .toSorted(([, first], [, second]) => second - first);
    const cached = new Set(enabled.slice(0, this.cacheSize()).map(([entry]) => entry));
    const isKept = (entry: Entry) => entry.cacheMode === NavigationCacheMode.REQUIRED || cached.has(entry);
    const released = others.map(([entry]) => entry).filter(entry => !isKept(entry));
    for (const entry of released) {
      this.mounted.delete(entry);
    }

    return released;
  }
}
