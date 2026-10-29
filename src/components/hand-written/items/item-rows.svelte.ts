import type { Group, GroupingProps } from "./grouping.ts";
import { groupItems, groupRowKey, isGroupRowKey } from "./grouping.ts";
import { duplicateKey, syncKeyVector } from "./key-vector.ts";
import type { KeyBox } from "./key-vector.ts";
import { KeyedRows, mountSnippetRow } from "./keyed-rows.svelte.ts";
import type { LiveRow } from "./live-rows.ts";
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

/** What the keys of a grouped list stand for: an item, or the header of a group. */
class GroupHeader<Item> {
  readonly group: Group<Item>;

  constructor(group: Group<Item>) {
    this.group = group;
  }
}

type Entry<Item> = Item | GroupHeader<Item>;

function isHeader<Item>(entry: Entry<Item>): entry is GroupHeader<Item> {
  return entry instanceof GroupHeader;
}

/** What a flat list takes: the items and their row, and optionally to show them in groups. */
export type FlatRowsProps<Item> = ItemRowsProps<Item> & Partial<GroupingProps<Item>>;

/** The rows of the items a control shows, and the keys it holds in their place. */
export class ItemRows<Item> {
  /** The control's items: the keys, boxed. */
  readonly keys = IVector_Object.from(DynWinRtValue.createVector([], DynWinRtType.object()));
  private readonly props: FlatRowsProps<Item>;
  private readonly rows: KeyedRows<Entry<Item>>;

  private keyOrder: string[] = [];
  private itemKeys: string[] = [];
  private isChangingKeys = false;

  constructor({ props, onSynced }: {
    props: FlatRowsProps<Item>;
    // The items were brought to the keys; the rows show what they stand for now.
    onSynced?: () => void;
  }) {
    this.props = props;
    this.rows = new KeyedRows(args => this.mountEntry(args));
    $effect(() => {
      this.sync(props.items ?? []);
      onSynced?.();
    });
  }

  /** The keys in the order the list shows them, a group's header among them. */
  get order() {
    return this.keyOrder;
  }

  /** The keys of the items in the order the list shows them: what can be selected. */
  get itemOrder() {
    return this.itemKeys;
  }

  /** The rows are changing the control's items: what it reports meanwhile (a selection lost) is not the user's. */
  get isChanging() {
    return this.isChangingKeys;
  }

  /** The user left the control's items in `order` (a drag): it is the list's order now. */
  adoptOrder(order: string[]) {
    this.keyOrder = order;
    this.itemKeys = order;
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
   * the app has no item for, and for a group's header.
   */
  show({ container, slot, key }: {
    container: FrameworkElement;
    slot: ContentControl;
    key: string;
  }) {
    const entry = this.rows.show({
      container,
      slot,
      key
    });
    const isItem = entry !== undefined && !isHeader(entry);
    return isItem ? entry : undefined;
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
    const rows = this.arrange(items);
    const wanted = rows.map(([key]) => key);
    const duplicate = duplicateKey(wanted);
    const hasDuplicate = duplicate !== undefined;
    if (hasDuplicate) {
      throw new Error(`two items have the key "${duplicate}"; a list's keys must be unique`);
    }

    this.keyOrder = wanted;
    this.itemKeys = wanted.filter(key => !isGroupRowKey(key));
    this.changingKeys(() => syncKeyVector({
      vector: this.keys,
      codec: keyBox,
      wanted
    }));
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not component state
    this.rows.setEntries(new Map(rows));
  }

  // The rows in the order the list shows them, by key: the items, or each
  // group's header followed by its items.
  private arrange(items: readonly Item[]) {
    const { key, groupBy } = this.props;
    const rows: Array<readonly [string, Entry<Item>]> = [];
    const isGrouped = groupBy !== undefined;
    if (!isGrouped) {
      for (const item of items) {
        rows.push([key(item), item]);
      }

      return rows;
    }

    for (const group of groupItems({
      items,
      groupBy
    })) {
      rows.push([groupRowKey(group.key), new GroupHeader(group)]);
      for (const item of group.items) {
        rows.push([key(item), item]);
      }
    }

    return rows;
  }

  private changingKeys(change: () => void) {
    this.isChangingKeys = true;
    try {
      change();
    } finally {
      this.isChangingKeys = false;
    }
  }

  private mountEntry({ slot, entry }: {
    slot: ContentControl;
    entry: Entry<Item>;
  }) {
    if (isHeader(entry)) {
      const header = mountSnippetRow({
        slot,
        snippet: this.props.groupHeader,
        value: entry.group
      });
      const headerRow: LiveRow<Entry<Item>> = {
        update(next) {
          if (isHeader(next)) {
            header.update(next.group);
          }
        },
        unmount: () => header.unmount()
      };
      return headerRow;
    }

    const row = mountSnippetRow({
      slot,
      snippet: this.props.item,
      value: entry
    });
    const itemRow: LiveRow<Entry<Item>> = {
      update(next) {
        if (!isHeader(next)) {
          row.update(next);
        }
      },
      unmount: () => row.unmount()
    };
    return itemRow;
  }
}
