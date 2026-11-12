import { MenuItemKind } from "./types.ts";
import type { MenuItem } from "./types.ts";
import { MenuModelError } from "./values.ts";

export const ROOT_ID = "";

/** A declared item with its dynamic children made, and the id of the menu that holds it. */
export interface ExpandedItem<ItemId extends string> {
  readonly item: MenuItem<ItemId>;
  readonly parentId: ItemId | typeof ROOT_ID;
  readonly children: ReadonlyArray<ExpandedItem<ItemId>>;
}

function childrenOf<ItemId extends string>(item: MenuItem<ItemId>) {
  const isSubmenu = item.kind === MenuItemKind.SUBMENU;
  if (!isSubmenu) {
    return [];
  }

  const { items, sort, maxItems } = item;
  const isFixed = typeof items !== "function";
  if (isFixed) {
    return items;
  }

  const made = [...items()];
  if (sort) {
    made.sort(sort);
  }

  return maxItems ? made.slice(0, maxItems) : made;
}

/**
 * Evaluates every dynamic list once and checks the tree: ids are unique and
 * a radio item has a group; the one place that both `resolveMenu` and
 * `describeMenu` read the declared tree from.
 *
 * @param options - `items`: the declared menu.
 * @returns The tree with each dynamic list made.
 */
export function expandMenu<ItemId extends string>({ items }: { readonly items: ReadonlyArray<MenuItem<ItemId>> }) {
  const seen = new Set<string>();
  function expandList({ list, parentId }: {
    readonly list: ReadonlyArray<MenuItem<ItemId>>;
    readonly parentId: ItemId | typeof ROOT_ID;
  }): Array<ExpandedItem<ItemId>> {
    return list.map(item => {
      if (seen.has(item.id)) {
        throw new MenuModelError(`Menu item id "${item.id}" is used more than once; ids must be unique`);
      }

      seen.add(item.id);
      const isUngroupedRadio = item.kind === MenuItemKind.RADIO && !item.group;
      if (isUngroupedRadio) {
        throw new MenuModelError(`Radio item "${item.id}" needs a group`);
      }

      return {
        item,
        parentId,
        children: expandList({
          list: childrenOf(item),
          parentId: item.id
        })
      };
    });
  }

  return expandList({
    list: items,
    parentId: ROOT_ID
  });
}
