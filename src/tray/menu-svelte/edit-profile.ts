import { defaultProfile } from "#src/tray/menu/default-profile.js";
import type { MenuItemDescription, MenuLevel, MenuProfile } from "#src/tray/menu/types.js";
import { isLevelShown } from "#src/tray/menu/values.js";

/** Which way a reorder moves an item among its siblings. */
export const MoveDirection = {
  UP: "up",
  DOWN: "down"
} as const;

/** One of `MoveDirection`'s values. */
export type MoveDirection = typeof MoveDirection[keyof typeof MoveDirection];

/** One row of the editor's tree: an item as described, with where it sits and what the profile makes of it. */
export interface EditorRow<ItemId extends string = string> extends MenuItemDescription<ItemId> {
  /** How many submenus hold the row; 0 at the root. */
  readonly depth: number;

  /** What the menu shows for the item now: the level, then the user's hidden and shown. */
  readonly isShown: boolean;
  readonly canMoveUp: boolean;
  readonly canMoveDown: boolean;
}

/**
 * Whether the menu shows an item under a profile; the rule `resolveMenu`
 * applies (an app's own `isVisible` is not known here).
 *
 * @param options - `description`: the item; `profile`: the user's choice.
 * @returns True when the item is shown.
 */
export function isItemShown<ItemId extends string>({ description, profile }: {
  readonly description: MenuItemDescription<ItemId>;
  readonly profile: MenuProfile<ItemId>;
}) {
  if (description.isRequired) {
    return true;
  }

  const isHidden = profile.hidden.includes(description.id);
  const isShownByLevel = isLevelShown({
    itemLevel: description.level,
    level: profile.level
  });
  const isShownByUser = profile.shown.includes(description.id);
  return !isHidden && (isShownByLevel || isShownByUser);
}

function without<ItemId extends string>({ ids, id }: {
  readonly ids: readonly ItemId[];
  readonly id: ItemId;
}) {
  return ids.filter(kept => kept !== id);
}

/**
 * Turns one item on or off, keeping the profile as small as it can be: an
 * item the level already shows is hidden by a `hidden` entry, an item above
 * the level is shown by a `shown` entry, and turning it back removes the entry.
 * An item with `isRequired` stays as it is.
 *
 * @param options - `profile`: the user's choice; `description`: the item; `isShown`: what the user wants.
 * @returns The new profile.
 */
export function setItemShown<ItemId extends string>({ profile, description, isShown }: {
  readonly profile: MenuProfile<ItemId>;
  readonly description: MenuItemDescription<ItemId>;
  readonly isShown: boolean;
}) {
  if (description.isRequired) {
    return profile;
  }

  const { id } = description;
  const isShownByLevel = isLevelShown({
    itemLevel: description.level,
    level: profile.level
  });
  const hidden = without({
    ids: profile.hidden,
    id
  });
  const shown = without({
    ids: profile.shown,
    id
  });
  const isHideNeeded = !isShown && isShownByLevel;
  const isShowNeeded = isShown && !isShownByLevel;
  if (isHideNeeded) {
    hidden.push(id);
  }

  if (isShowNeeded) {
    shown.push(id);
  }

  return {
    ...profile,
    hidden,
    shown
  } satisfies MenuProfile<ItemId>;
}

/**
 * Changes the detail level and keeps every tweak the user made.
 *
 * @param options - `profile`: the user's choice; `level`: the new level.
 * @returns The new profile.
 */
export function setLevel<ItemId extends string>({ profile, level }: {
  readonly profile: MenuProfile<ItemId>;
  readonly level: MenuLevel;
}) {
  return {
    ...profile,
    level
  } satisfies MenuProfile<ItemId>;
}

/**
 * Whether the user changed anything beyond the level: hid or showed an item,
 * or put a menu in another order.
 *
 * @param profile - The user's choice.
 * @returns True when the profile has tweaks.
 */
export function hasTweaks<ItemId extends string>(profile: MenuProfile<ItemId>) {
  const isOrdered = Object.values(profile.order).some(ids => ids.length > 0);
  return profile.hidden.length > 0 || profile.shown.length > 0 || isOrdered;
}

/**
 * Whether the profile differs from `defaultProfile()`, which is what Reset
 * returns to.
 *
 * @param profile - The user's choice.
 * @returns True when Reset would change something.
 */
export function isCustomized<ItemId extends string>(profile: MenuProfile<ItemId>) {
  return profile.level !== defaultProfile().level || hasTweaks(profile);
}

function siblingsOf<ItemId extends string>({ descriptions, parentId, profile }: {
  readonly descriptions: ReadonlyArray<MenuItemDescription<ItemId>>;
  readonly parentId: ItemId | "";
  readonly profile: MenuProfile<ItemId>;
}) {
  const declared = descriptions.filter(description => description.parentId === parentId);
  const wanted = profile.order[parentId] ?? [];
  const first = new Set(wanted.flatMap(id => declared.filter(description => description.id === id)));
  return [...first, ...declared.filter(description => !first.has(description))];
}

// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
function rowsUnder<ItemId extends string>({ descriptions, parentId, profile, depth }: {
  readonly descriptions: ReadonlyArray<MenuItemDescription<ItemId>>;
  readonly parentId: ItemId | "";
  readonly profile: MenuProfile<ItemId>;
  readonly depth: number;
}): Array<EditorRow<ItemId>> {
  const siblings = siblingsOf({
    descriptions,
    parentId,
    profile
  });
  return siblings.flatMap((description, i) => [
    {
      ...description,
      depth,
      isShown: isItemShown({
        description,
        profile
      }),
      canMoveUp: i > 0,
      canMoveDown: i < siblings.length - 1
    },
    ...rowsUnder({
      descriptions,
      parentId: description.id,
      profile,
      depth: depth + 1
    })
  ]);
}

/**
 * The rows of the editor's tree: every item, each menu in the user's order
 * with a submenu before its children.
 *
 * @param options - `descriptions`: `describeMenu`'s list; `profile`: the user's choice.
 * @returns The rows, depth first.
 */
export function editorRows<ItemId extends string>({ descriptions, profile }: {
  readonly descriptions: ReadonlyArray<MenuItemDescription<ItemId>>;
  readonly profile: MenuProfile<ItemId>;
}) {
  return rowsUnder({
    descriptions,
    parentId: "",
    profile,
    depth: 0
  });
}

/**
 * Moves an item one place among the items of the same menu. The order of that
 * menu is stored whole, or dropped again when it is the declared one. An item
 * at the end of its menu stays where it is.
 *
 * @param options - `profile`: the user's choice; `descriptions`: `describeMenu`'s list; `id`: the item;
 *   `direction`: up or down.
 * @returns The new profile.
 */
export function moveItem<ItemId extends string>({ profile, descriptions, id, direction }: {
  readonly profile: MenuProfile<ItemId>;
  readonly descriptions: ReadonlyArray<MenuItemDescription<ItemId>>;
  readonly id: ItemId;
  readonly direction: MoveDirection;
}) {
  const moved = descriptions.find(description => description.id === id);
  if (!moved) {
    return profile;
  }

  const { parentId } = moved;
  const siblings = siblingsOf({
    descriptions,
    parentId,
    profile
  }).map(description => description.id);
  const from = siblings.indexOf(id);
  const to = direction === MoveDirection.UP ? from - 1 : from + 1;
  const isInside = to >= 0 && to < siblings.length;
  if (!isInside) {
    return profile;
  }

  const swapped = [...siblings];
  swapped[from] = siblings[to] ?? id;
  swapped[to] = id;
  const declared = descriptions
    .filter(description => description.parentId === parentId)
    .map(description => description.id);
  const isDeclared = swapped.every((sibling, i) => sibling === declared[i]);
  const order: Record<string, readonly ItemId[]> = {};
  for (const [parent, ids] of Object.entries(profile.order)) {
    const isKept = parent !== parentId && ids !== undefined;
    if (isKept) {
      order[parent] = ids;
    }
  }

  if (!isDeclared) {
    order[parentId] = swapped;
  }

  return {
    ...profile,
    // Object.entries gives string keys; they are the ids and "" that the profile already held
    // oxlint-disable-next-line typescript/consistent-type-assertions -- see above
    order: order as MenuProfile<ItemId>["order"]
  } satisfies MenuProfile<ItemId>;
}
