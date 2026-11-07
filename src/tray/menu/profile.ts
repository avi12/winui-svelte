import { MenuLevel } from "./types.ts";
import type { MenuProfile } from "./types.ts";
import { z } from "zod";

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

const levelSchema = z.enum([MenuLevel.SIMPLE, MenuLevel.STANDARD, MenuLevel.FULL]);

function schemaFor(level: MenuLevel) {
  return z.object({
    level: levelSchema.catch(level),
    hidden: z.array(z.string()).catch([]),
    shown: z.array(z.string()).catch([]),
    order: z.record(z.string(), z.array(z.string())).catch({})
  });
}

/** The shape of a saved profile; a field that is wrong falls back to the default one. */
export const profileSchema = schemaFor(MenuLevel.SIMPLE);

/**
 * Makes a profile of loose data, such as parsed JSON: never throws, and a
 * field that is missing or wrong falls back to its default.
 *
 * The ids are taken on trust: a saved file may name ones the app no longer
 * has, and `resolveMenu` ignores them.
 *
 * @param options - `value`: the loose data; `level`: the level to fall back to.
 * @returns The profile.
 */
export function parseProfile<ItemId extends string = string>({ value, level = MenuLevel.SIMPLE }: {
  readonly value: unknown;
  readonly level?: MenuLevel;
}) {
  const parsed = schemaFor(level).safeParse(value);
  const fallback = defaultProfile<ItemId>({ level });
  // a saved file may name ids the app no longer has; resolveMenu ignores them, so the type states what the app writes
  // oxlint-disable-next-line typescript/consistent-type-assertions -- see above
  return parsed.success ? parsed.data as unknown as MenuProfile<ItemId> : fallback;
}
