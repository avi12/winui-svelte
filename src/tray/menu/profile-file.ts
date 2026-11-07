import { parseProfile } from "./profile.ts";
import { MenuLevel } from "./types.ts";
import type { MenuProfile } from "./types.ts";
import { atomicFile } from "#src/web-apis/atomic-file.js";

function parseJson(text: string | undefined) {
  if (!text) {
    return undefined;
  }

  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Reads the user's profile from a JSON file.
 *
 * @param options - `file`: the path; `level`: the level to use for what the file lacks.
 * @returns The profile; the default one when the file is missing or unreadable.
 */
export function loadProfile<ItemId extends string = string>({ file, level = MenuLevel.SIMPLE }: {
  readonly file: string;
  readonly level?: MenuLevel;
}) {
  return parseProfile<ItemId>({
    value: parseJson(atomicFile(file).read()),
    level
  });
}

/**
 * Writes the profile as JSON, replacing the file atomically (its folder is made).
 *
 * @param options - `file`: the path; `profile`: what to write.
 */
export function saveProfile<ItemId extends string>({ file, profile }: {
  readonly file: string;
  readonly profile: MenuProfile<ItemId>;
}) {
  atomicFile(file).write(`${JSON.stringify(profile, undefined, 2)}\n`);
}
