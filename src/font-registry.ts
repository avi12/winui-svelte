import { installFontSpelling } from "#src/font-spelling.js";

// The table of registered fonts and the spelling of a family as WinUI takes it,
// installed into `font-spelling.ts` by the first registration. It has no Node
// import, so an app that uses no font file bundles neither this nor the code
// that finds a file (`font-files.ts`).

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

/**
 * Remembers the file of a family; `registerFont` is what finds the file.
 *
 * @param options - The family, and the absolute path of its file.
 */
export function rememberFont({ family, file }: {
  family: string;
  file: string;
}) {
  files.set(keyOf(family), file);
  installFontSpelling(spelled);
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

function spelled(families: string) {
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
