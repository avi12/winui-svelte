import { MenuLevel } from "./types.ts";
import type { MenuValue } from "./types.ts";

const LEVEL_ORDER: readonly MenuLevel[] = [MenuLevel.SIMPLE, MenuLevel.STANDARD, MenuLevel.FULL];

/** The error for a menu that cannot be built: a repeated id, a radio with no group. */
export class MenuModelError extends Error {
  override readonly name = "MenuModelError";
}

/** The value of a `MenuValue`: the value itself, or what its function gives now. */
export function valueOf<T extends string | boolean>(value: MenuValue<T>) {
  return typeof value === "function" ? value() : value;
}

/** Whether an item of `itemLevel` is shown at `level`. */
export function isLevelShown({ itemLevel, level }: {
  readonly itemLevel: MenuLevel;
  readonly level: MenuLevel;
}) {
  return LEVEL_ORDER.indexOf(itemLevel) <= LEVEL_ORDER.indexOf(level);
}
