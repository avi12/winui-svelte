import type { Snippet } from "svelte";

// Items shown in groups. A grouped list is one flat list of rows: each group's
// header is a row of its own, followed by the group's items. The header's key
// is made from the group's key and a prefix no app key has, so the two never
// collide.

/** The items that share a group key, in the order the list shows them. */
export interface Group<Item> {
  readonly key: string;
  readonly items: readonly Item[];
}

/** What a list takes to show its items in groups. */
export interface GroupingProps<Item> {
  // The group of an item. Groups follow each other in the order their first
  // item appears; an item stays in the order `items` has it within its group.
  groupBy: (item: Item) => string;
  // The header row of a group.
  groupHeader: Snippet<[Group<Item>]>;
}

// A private-use character: no key an app writes starts with it.
const GROUP_ROW_PREFIX = "group:";

/** The key of the header row of the group with this key. */
export function groupRowKey(groupKey: string) {
  return `${GROUP_ROW_PREFIX}${groupKey}`;
}

/** Whether the key is that of a group's header row, not of an item. */
export function isGroupRowKey(key: string) {
  return key.startsWith(GROUP_ROW_PREFIX);
}

/** The items in groups: the groups in first-appearance order, each with its items in their order. */
export function groupItems<Item>({ items, groupBy }: {
  items: readonly Item[];
  groupBy: (item: Item) => string;
}) {
  const itemsByGroup = new Map<string, Item[]>();
  for (const item of items) {
    const groupKey = groupBy(item);
    const inGroup = itemsByGroup.get(groupKey) ?? [];
    inGroup.push(item);
    itemsByGroup.set(groupKey, inGroup);
  }

  return Array.from(itemsByGroup, ([key, inGroup]) => ({
    key,
    items: inGroup
  } satisfies Group<Item>));
}
