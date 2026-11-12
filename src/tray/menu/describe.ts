import { expandMenu } from "./expand.ts";
import type { ExpandedItem } from "./expand.ts";
import { MenuItemKind, MenuLevel } from "./types.ts";
import type { MenuItem, MenuItemDescription } from "./types.ts";
import { valueOf } from "./values.ts";

function labelOf<ItemId extends string>(item: MenuItem<ItemId>) {
  return item.kind === MenuItemKind.SEPARATOR ? "" : valueOf(item.label);
}

function describeList<ItemId extends string>(
  nodes: ReadonlyArray<ExpandedItem<ItemId>>
): Array<MenuItemDescription<ItemId>> {
  return nodes.flatMap(({ item, parentId, children }) => [
    {
      id: item.id,
      kind: item.kind,
      label: labelOf(item),
      level: item.level ?? MenuLevel.SIMPLE,
      parentId,
      isRequired: item.isRequired === true
    },
    ...describeList(children)
  ]);
}

/**
 * The flat list of every item, in declared order with a submenu before its
 * children (dynamic lists evaluated now), for an editor to list.
 *
 * @param options - `items`: the declared menu.
 * @returns One row per item, separators included.
 */
export function describeMenu<const ItemId extends string>({ items }: {
  readonly items: ReadonlyArray<MenuItem<ItemId>>;
}) {
  return describeList(expandMenu({ items }));
}
