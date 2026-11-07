import { MenuLevel } from "./types.ts";
import type { MenuProfile } from "./types.ts";

/**
 * The profile of a user who has chosen nothing.
 *
 * @param options - `level`: the level to start at, `simple` when left out.
 * @returns A new profile that hides, shows and orders nothing.
 */
export function defaultProfile<ItemId extends string = never>({ level = MenuLevel.SIMPLE }: {
  readonly level?: MenuLevel;
} = {}) {
  const profile: MenuProfile<ItemId> = {
    level,
    hidden: [],
    shown: [],
    order: {}
  };
  return profile;
}
