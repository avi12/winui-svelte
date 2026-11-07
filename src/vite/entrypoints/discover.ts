import { existsSync } from "node:fs";
import path from "node:path";

/** The names an `entrypoints/` folder is read for, like WXT's. */
export const Entrypoint = {
  MAIN: "main",
  WINDOW: "window",
  TRAY: "tray"
} as const;
type Entrypoint = typeof Entrypoint[keyof typeof Entrypoint];

/** The folder, next to the app's root, whose files are entries by their names. */
export const ENTRYPOINTS_FOLDER = "entrypoints";

const EXTENSIONS = [".ts", ".js"];
const MARKUP_EXTENSIONS = {
  [Entrypoint.MAIN]: [],
  [Entrypoint.WINDOW]: [],
  [Entrypoint.TRAY]: [".svelte"]
} as const;

function fileOf({ folder, name }: {
  folder: string;
  name: Entrypoint;
}) {
  const candidates = [...EXTENSIONS, ...MARKUP_EXTENSIONS[name]].flatMap(extension => [
    path.join(folder, `${name}${extension}`),
    path.join(folder, name, `index${extension}`)
  ]).filter(candidate => existsSync(candidate));
  const [first, second] = candidates;
  if (second) {
    throw new Error(`the ${name} entrypoint is declared twice: ${first} and ${second}`);
  }

  return first;
}

/**
 * Finds the entries an app declares by convention: `entrypoints/main.ts`,
 * `window.ts` and `tray.ts` (or `tray/index.ts`; `.js` works too, and the tray
 * can be `tray.svelte`, the menu written as markup).
 *
 * @param root - The app's folder.
 * @returns The absolute path of each entry that exists.
 */
export function discoverEntrypoints(root: string) {
  const folder = path.join(root, ENTRYPOINTS_FOLDER);
  const found: Partial<Record<Entrypoint, string>> = {};
  for (const name of Object.values(Entrypoint)) {
    const file = fileOf({
      folder,
      name
    });
    const isFound = file !== undefined;
    if (isFound) {
      found[name] = file;
    }
  }

  return found;
}

/**
 * Whether `file` is a path under `folder` (and not the folder itself).
 *
 * @param options - The folder and the path.
 * @returns True when it is inside.
 */
export function isInsideFolder({ folder, file }: {
  folder: string;
  file: string;
}) {
  const relative = path.relative(folder, file);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}
