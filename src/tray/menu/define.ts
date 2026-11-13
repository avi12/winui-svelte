import type { MenuItem } from "./types.ts";

/**
 * Declares a menu so that its ids stay literal types: a profile for the
 * result (`MenuProfile<MenuIds<typeof menu>>`) rejects an id that is not in it.
 *
 * @param items - The lines of the menu.
 * @returns The same lines.
 */
export function defineMenu<const ItemId extends string>(items: readonly MenuItem<ItemId>[]) {
  return items;
}
