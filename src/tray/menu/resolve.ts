import { defaultProfile } from "./default-profile.ts";
import { expandMenu, ROOT_ID } from "./expand.ts";
import type { ExpandedItem } from "./expand.ts";
import { resolveNodes } from "./resolve-lite.ts";
import type { ResolveStage } from "./resolve-lite.ts";
import { MenuLevel } from "./types.ts";
import type { MenuItem, MenuProfile } from "./types.ts";
import { isLevelShown } from "./values.ts";

function isKept<ItemId extends string>({ item, profile }: {
  readonly item: MenuItem<ItemId>;
  readonly profile: MenuProfile<ItemId>;
}) {
  if (item.isRequired) {
    return true;
  }

  const isShownByLevel = isLevelShown({
    itemLevel: item.level ?? MenuLevel.SIMPLE,
    level: profile.level
  });
  const isHiddenByUser = profile.hidden.includes(item.id);
  return !isHiddenByUser && (isShownByLevel || profile.shown.includes(item.id));
}

function ordered<ItemId extends string>({ nodes, profile, parentId }: {
  readonly nodes: readonly ExpandedItem<ItemId>[];
  readonly profile: MenuProfile<ItemId>;
  readonly parentId: ItemId | typeof ROOT_ID;
}) {
  const wanted = profile.order[parentId] ?? [];
  const first = new Set(wanted.flatMap(id => nodes.filter(node => node.item.id === id)));
  const rest = nodes.filter(node => !first.has(node));
  return [...first, ...rest];
}

/**
 * Makes the tree a renderer draws from the declared menu and the profile of
 * the user. Every function value (label, state, dynamic list) is read now, so
 * call it each time the menu opens.
 *
 * Items are kept by level, hidden and shown; an `isRequired` item survives
 * the profile (but not its own `isVisible`). Each menu is put in the order of
 * the profile, with ids the profile does not know after it in declared order.
 * Then separators are collapsed, headers with nothing under them dropped, and
 * a submenu with nothing in it dropped (or shown as its `emptyLabel`).
 *
 * @param options - `items`: the declared menu; `profile`: the choice of the user, `defaultProfile()` when left out.
 * @returns The lines to draw.
 * @throws MenuModelError - An id is used twice, or a radio has no group.
 */
export function resolveMenu<const ItemId extends string>({ items, profile = defaultProfile() }: {
  readonly items: readonly MenuItem<ItemId>[];
  readonly profile?: MenuProfile<NoInfer<ItemId>>;
}) {
  const stage: ResolveStage<NoInfer<ItemId>> = {
    isKept: item => isKept({
      item,
      profile
    }),
    ordered: ({ nodes, parentId }) => ordered({
      nodes,
      profile,
      parentId
    })
  };
  return resolveNodes({
    nodes: expandMenu({ items }),
    parentId: ROOT_ID,
    stage
  });
}
