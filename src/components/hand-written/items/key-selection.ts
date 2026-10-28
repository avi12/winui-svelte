import type { KeyBox } from "./key-vector.ts";

// Which keys a list control has selected, kept in step with the keys the app
// binds (`selectedKey` and `selectedKeys`). The control holds the keys as
// boxed items, so a selection is the boxes of its keys.

/** The part of a control's selected-items vector this module uses; its method shapes are WinRT's. */
export interface SelectedVector<Boxed> {
  readonly size: number;
  getAt(index: number): Boxed;
  clear(): void;
  append(boxedKey: Boxed): void;
}

/** How many items the user can select. */
export const SelectionKind = {
  NONE: "none",
  SINGLE: "single",
  MULTIPLE: "multiple"
} as const;

/** One of `SelectionKind`'s values. */
export type SelectionKind = (typeof SelectionKind)[keyof typeof SelectionKind];

/** The control as the selection sees it. */
export interface SelectionView<Boxed> {
  readonly kind: SelectionKind;
  readonly selected: SelectedVector<Boxed>;
  /** The box the control holds for this key: it finds an item by the very object it holds. */
  boxOf(key: string): Boxed;
}

/** What the app binds. */
export interface SelectionBound {
  selectedKey?: string | undefined;
  selectedKeys?: string[] | undefined;
}

/** The keys that are in `order`, in `order`'s order. */
export function inListOrder({ keys, order }: {
  keys: readonly string[];
  order: readonly string[];
}) {
  const wanted = new Set(keys);
  return order.filter(key => wanted.has(key));
}

/** Whether two lists hold the same keys, in any order. */
export function sameKeys({ first, second }: {
  first: readonly string[];
  second: readonly string[];
}) {
  const inFirst = new Set(first);
  return first.length === second.length && inFirst.size === first.length && second.every(key => inFirst.has(key));
}

/**
 * Brings the control's selection to the app's keys, and the app's keys to the
 * control's selection when the user changes it.
 */
export class KeySelection<Boxed> {
  private readonly view: SelectionView<Boxed>;
  private readonly codec: KeyBox<Boxed>;
  private readonly bound: SelectionBound;
  private readonly order: () => readonly string[];
  private readonly isPaused: () => boolean;
  private isApplying = false;

  constructor({ view, codec, bound, order, isPaused }: {
    view: SelectionView<Boxed>;
    codec: KeyBox<Boxed>;
    bound: SelectionBound;
    /** The keys in the order the list shows them. */
    order: () => readonly string[];
    /** The control's own items are being changed (a sync, a drag), so what it reports is not the user's choice. */
    isPaused: () => boolean;
  }) {
    this.view = view;
    this.codec = codec;
    this.bound = bound;
    this.order = order;
    this.isPaused = isPaused;
  }

  /**
   * The app's keys become the control's selection. A key that has no item
   * any more is dropped from what the app holds. Reads the bound props, so
   * an effect that calls it follows them.
   */
  apply() {
    const isSelectable = this.view.kind !== SelectionKind.NONE;
    if (!isSelectable) {
      return;
    }

    const wanted = this.wanted();
    const known = inListOrder({
      keys: wanted,
      order: this.order()
    });
    const isCurrent = sameKeys({
      first: this.read(),
      second: known
    });
    if (!isCurrent) {
      this.select(known);
    }

    const isStale = known.length !== wanted.length;
    if (isStale) {
      this.report(known);
    }
  }

  /** The control's selection changed: the user's choice becomes the app's keys. */
  changed() {
    const isUserChoice = !this.isApplying && !this.isPaused();
    if (isUserChoice) {
      this.report(this.read());
    }
  }

  private wanted() {
    const { selectedKey, selectedKeys } = this.bound;
    const isMultiple = this.view.kind === SelectionKind.MULTIPLE;
    if (isMultiple) {
      return selectedKeys ?? [];
    }

    return selectedKey === undefined ? [] : [selectedKey];
  }

  private read() {
    const keys: string[] = [];
    for (let i = 0; i < this.view.selected.size; i++) {
      keys.push(this.codec.unbox(this.view.selected.getAt(i)));
    }

    return inListOrder({
      keys,
      order: this.order()
    });
  }

  private select(keys: readonly string[]) {
    this.isApplying = true;
    try {
      this.view.selected.clear();
      for (const key of keys) {
        this.view.selected.append(this.view.boxOf(key));
      }
    } finally {
      this.isApplying = false;
    }
  }

  private report(keys: string[]) {
    const isKeysChanged = !sameKeys({
      first: this.bound.selectedKeys ?? [],
      second: keys
    });
    if (isKeysChanged) {
      this.bound.selectedKeys = keys;
    }

    const [first] = keys;
    const isKeyChanged = this.bound.selectedKey !== first;
    if (isKeyChanged) {
      this.bound.selectedKey = first;
    }
  }
}
