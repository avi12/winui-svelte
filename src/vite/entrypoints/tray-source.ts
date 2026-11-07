import { lowerTraySvelte } from "./lower-tray-svelte.ts";
import { readFileSync } from "node:fs";
import path from "node:path";

/** The extension of a tray entrypoint written as markup. */
export const SVELTE_EXTENSION = ".svelte";

/**
 * The TypeScript of a tray entrypoint: the file itself for `tray.ts`, the
 * lowered code for `tray.svelte`.
 *
 * @param file - The absolute path of the tray entrypoint.
 * @returns The text to read `icon`, `tooltip` and `guid` from, and to build.
 */
export function traySourceOf(file: string) {
  const text = readFileSync(file, "utf8");
  return path.extname(file) === SVELTE_EXTENSION ? lowerTraySvelte({
    source: text,
    file
  }) : text;
}
