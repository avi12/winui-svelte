import { inListOrder, sameKeys } from "./key-selection.ts";

// Which keys of a tree are expanded, kept in step with the keys the app binds
// (`expandedKeys`). The tree keeps its own set, so a tree whose app does not
// bind them still stays as the user left it.

/** What the app binds. */
export interface ExpandedBound {
  expandedKeys?: string[] | undefined;
}

/** The keys of a tree that are expanded. */
export class ExpandedKeys {
  private readonly bound: ExpandedBound;
  private readonly order: () => readonly string[];
  private keys = new Set<string>();

  constructor({ bound, order }: {
    bound: ExpandedBound;
    /** The keys in the order the tree shows them. */
    order: () => readonly string[];
  }) {
    this.bound = bound;
    this.order = order;
  }

  /** Whether the item with this key is expanded. */
  has(key: string) {
    return this.keys.has(key);
  }

  /**
   * The app's keys become the expanded ones. Reads the bound prop, so an
   * effect that calls it follows it. True when they differ from what was held.
   */
  adopt() {
    const { expandedKeys } = this.bound;
    const isBound = expandedKeys !== undefined;
    if (!isBound) {
      return false;
    }

    const isCurrent = sameKeys({
      first: expandedKeys,
      second: [...this.keys]
    });
    if (isCurrent) {
      return false;
    }

    this.keys = new Set(expandedKeys);
    return true;
  }

  /** The user expanded or collapsed the item with this key: the app's keys follow. */
  toggled({ key, isExpanded }: {
    key: string;
    isExpanded: boolean;
  }) {
    const isChange = this.keys.has(key) !== isExpanded;
    if (!isChange) {
      return;
    }

    if (isExpanded) {
      this.keys.add(key);
    } else {
      this.keys.delete(key);
    }

    this.bound.expandedKeys = this.inTreeOrder();
  }

  // The tree's order, then the keys it has no node for (an item not shown yet).
  private inTreeOrder() {
    const shown = inListOrder({
      keys: [...this.keys],
      order: this.order()
    });
    const hidden = [...this.keys].filter(key => !shown.includes(key));
    return [...shown, ...hidden];
  }
}
