import { duplicateKey, syncKeyVector } from "./key-vector.ts";
import type { KeyBox } from "./key-vector.ts";
import { KeyedRows, mountSnippetRow } from "./keyed-rows.svelte.ts";
import { DynWinRtType, DynWinRtValue } from "@microsoft/dynwinrt";
import type { ContentControl, FrameworkElement } from "#src/components/generated/bindings.js";
import { AutomationProperties, IVector_Object, PropertyValue } from "#src/components/generated/bindings.js";
import type { BoxedValue } from "#src/native-value.js";
import { unboxed } from "#src/renderer/host/values.js";
import type { Snippet } from "svelte";

// What every control that shows a flat list of the app's items by a snippet
// shares: the keys the control holds as its items, and the rows (keyed-rows.svelte.ts)
// mounted into the slots of its item template. The control decides when a
// container shows a key (ListView: ContainerContentChanging, ItemsRepeater:
// ElementPrepared); this class does the rest.

/** The ContentControl a row is mounted into: stretched, and not a tab stop of its own. */
export const SLOT_ELEMENT = "<ContentControl IsTabStop=\"False\" HorizontalContentAlignment=\"Stretch\" "
  + "HorizontalAlignment=\"Stretch\"/>";

/** The item template whose root is the XAML `root`. */
export function templateOf(root: string) {
  return `<DataTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">${root}</DataTemplate>`;
}

/** What a control takes to show items: the items, their identity and the row of one. */
export interface ItemRowsProps<Item> {
  // The items, in the order they are shown.
  items?: readonly Item[];
  // An item's identity: unique in the list, and the same for the same thing
  // when the list changes, so its row is kept and only what changed moves.
  key: (item: Item) => string;
  // The row of an item.
  item?: Snippet<[Item]>;
}

/** What a control takes to name the container of an item for assistive technology. */
export interface ItemNameProps<Item> {
  // The accessible name of an item's container.
  itemName?: (item: Item) => string;
}

/** Gives the container the accessible name the app has for its item, if it has one. */
export function nameContainer<Item>({ container, item, props }: {
  container: FrameworkElement;
  item: Item | undefined;
  props: ItemNameProps<Item>;
}) {
  const name = item === undefined ? undefined : props.itemName?.(item);
  const hasName = name !== undefined;
  if (hasName) {
    AutomationProperties.setName(container, name);
  }
}

/** The text of a boxed key; a value that is not a key reads as the empty text. */
export function keyText(boxedKey: BoxedValue) {
  const value = unboxed(boxedKey);
  return typeof value === "string" ? value : "";
}

/** How a key is held in a control's items: as a boxed string. */
export const keyBox: KeyBox<BoxedValue> = {
  box: key => PropertyValue.createString(key),
  unbox: keyText
};

/** The rows of the items a control shows, and the keys it holds in their place. */
export class ItemRows<Item> {
  /** The control's items: the keys, boxed. */
  readonly keys = IVector_Object.from(DynWinRtValue.createVector([], DynWinRtType.object()));
  private readonly props: ItemRowsProps<Item>;
  private readonly rows: KeyedRows<Item>;

  private keyOrder: string[] = [];
  private isChangingKeys = false;

  constructor({ props, onSynced }: {
    props: ItemRowsProps<Item>;
    // The items were brought to the keys; the rows show what they stand for now.
    onSynced?: () => void;
  }) {
    this.props = props;
    this.rows = new KeyedRows(({ slot, entry }) => mountSnippetRow({
      slot,
      snippet: props.item,
      value: entry
    }));
    $effect(() => {
      this.sync(props.items ?? []);
      onSynced?.();
    });
  }

  /** The keys in the order the list shows them. */
  get order() {
    return this.keyOrder;
  }

  /** The rows are changing the control's items: what it reports meanwhile (a selection lost) is not the user's. */
  get isChanging() {
    return this.isChangingKeys;
  }

  /** The user left the control's items in `order` (a drag): it is the list's order now. */
  adoptOrder(order: string[]) {
    this.keyOrder = order;
  }

  /** Moves a key to `target` in the control's own items, as a keyboard move does. */
  moveKey({ key, target }: {
    key: string;
    target: number;
  }) {
    this.changingKeys(() => {
      this.keys.removeAt(this.keyOrder.indexOf(key));
      this.keys.insertAt(target, keyBox.box(key));
    });
    this.adoptOrder(this.readOrder());
  }

  /** The containers that show a row now. */
  containers() {
    return this.rows.containers();
  }

  /** The keys as the control holds them now, which a drag may have reordered. */
  readOrder() {
    const order: string[] = [];
    for (let i = 0; i < this.keys.size; i++) {
      order.push(keyText(this.keys.getAt(i)));
    }

    return order;
  }

  /**
   * The container shows `key` in `slot`. Its row stays when the key is the
   * same, else a new one replaces it. The item shown, or undefined for a key
   * the app has no item for.
   */
  show({ container, slot, key }: {
    container: FrameworkElement;
    slot: ContentControl;
    key: string;
  }) {
    return this.rows.show({
      container,
      slot,
      key
    });
  }

  /** The container went to the recycle queue: its row ends. */
  release(container: FrameworkElement) {
    this.rows.release(container);
  }

  /** Ends every row. */
  clear() {
    this.rows.clear();
  }

  private sync(items: readonly Item[]) {
    const keyed = items.map(item => [this.props.key(item), item] as const);
    const wanted = keyed.map(([key]) => key);
    const duplicate = duplicateKey(wanted);
    const hasDuplicate = duplicate !== undefined;
    if (hasDuplicate) {
      throw new Error(`two items have the key "${duplicate}"; a list's keys must be unique`);
    }

    this.keyOrder = wanted;
    this.changingKeys(() => syncKeyVector({
      vector: this.keys,
      codec: keyBox,
      wanted
    }));
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not component state
    this.rows.setEntries(new Map(keyed));
  }

  private changingKeys(change: () => void) {
    this.isChangingKeys = true;
    try {
      change();
    } finally {
      this.isChangingKeys = false;
    }
  }
}
