import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The font files an app ships, by the family name its CSS and props use. WinUI
// has no call that adds a font file to the process, and the obvious ways do not
// work: a FontFamily written as a `file:` URI is ignored, and a file added with
// AddFontResourceEx is invisible to its text layout once the first text has
// been laid out (and session-wide, so other programs see it, when it is not
// private; a private one is never seen). What does work, in an unpackaged
// process as well, is the `ms-appx:` scheme given an absolute path and the
// family name inside the file ("ms-appx:///C:/app/Face.ttf#Face"); once it has
// loaded, the bare name resolves in the process. So registering a font only
// remembers the file, and every font family a control or a style receives goes
// through `fontFamilySource`, which spells a registered name as that URI.

const FILE_PROTOCOL = "file:";
const FAMILY_SEPARATOR = ",";
const FRAGMENT = "#";
const APP_SCHEME = "ms-appx:///";
const RESERVED_CHARACTERS = /[%#?]/gu;
const files = new Map<string, string>();

function fontUriOf(file: string) {
  return `${APP_SCHEME}${file.replaceAll("\\", "/").replace(RESERVED_CHARACTERS, encodeURIComponent)}`;
}

function keyOf(family: string) {
  return family.trim().toLowerCase();
}

function candidatesOf({ source, base }: {
  source: string;
  base: string | undefined;
}) {
  const isFileUrl = source.startsWith(FILE_PROTOCOL);
  if (isFileUrl) {
    return [fileURLToPath(source)];
  }

  const isAbsolute = path.isAbsolute(source);
  if (isAbsolute) {
    return [source];
  }

  const hasBase = base !== undefined;
  if (!hasBase) {
    return [path.resolve(source)];
  }

  // A built app is one bundle: the stylesheet's own folder is gone, so the
  // file is also looked for by its name beside the bundle.
  const folder = path.dirname(fileURLToPath(base));
  return [path.resolve(folder, source), path.join(folder, path.basename(source))];
}

/**
 * Registers a font file under a family name, so a `font-family` of that name
 * (in a style sheet, on a prop, in a `FontFamily`) uses the file. The name
 * must be the family name written inside the file; matching is case-insensitive
 * and registering a name again replaces the file. Register before the control
 * that uses the font is created. A file added once stays usable by its name
 * for the life of the process, even after `unregisterFont`.
 *
 * @param options - The family, and the file: an absolute path, a `file:` URL, or a path relative to `base`
 *   (a `file:` URL such as `import.meta.url`; else the working folder).
 * @returns The absolute path of the file found.
 * @throws {Error} Naming the places looked when there is no such file.
 */
export function registerFont({ family, source, base }: {
  family: string;
  source: string;
  base?: string;
}) {
  const candidates = candidatesOf({
    source,
    base
  });
  const file = candidates.find(candidate => existsSync(candidate));
  const isFileMissing = file === undefined;
  if (isFileMissing) {
    throw new Error(`font file for "${family}" not found at ${candidates.join(" or ")}`);
  }

  files.set(keyOf(family), file);
  return file;
}

/**
 * Forgets the file of a family registered with `registerFont`.
 *
 * @param family - The family name.
 * @returns Whether it was registered.
 */
export function unregisterFont(family: string) {
  return files.delete(keyOf(family));
}

/**
 * Whether a family was registered with `registerFont`.
 *
 * @param family - The family name.
 * @returns True when it was.
 */
export function isFontRegistered(family: string) {
  return files.has(keyOf(family));
}

/**
 * A `font-family` list as WinUI's `FontFamily` takes it: every registered name
 * spelled as the `ms-appx:` URI of its file and the name, the rest as written.
 *
 * @param families - A comma-separated family list.
 * @returns The list.
 */
export function fontFamilySource(families: string) {
  const hasRegistered = files.size > 0;
  if (!hasRegistered) {
    return families;
  }

  return families.split(FAMILY_SEPARATOR).map(name => {
    const family = name.trim();
    const file = files.get(keyOf(family));
    const isRegistered = file !== undefined;
    return isRegistered ? `${fontUriOf(file)}${FRAGMENT}${family}` : family;
  }).join(`${FAMILY_SEPARATOR} `);
}
