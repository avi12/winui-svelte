// The one place a font family is spelled for WinUI: as written, until an app
// registers a font file (`font-registry.ts`), which installs the spelling that
// knows the files. Kept apart so that an app with no font file bundles only
// this.
function asWritten(families: string) {
  return families;
}

let spell = asWritten;

/**
 * A `font-family` list as WinUI's `FontFamily` takes it: every registered name
 * spelled as the `ms-appx:` URI of its file and the name, the rest as written.
 *
 * @param families - A comma-separated family list.
 * @returns The list.
 */
export function fontFamilySource(families: string) {
  return spell(families);
}

/**
 * Installs the spelling that knows the registered files.
 *
 * @param spelling - What `fontFamilySource` uses from now on.
 */
export function installFontSpelling(spelling: (families: string) => string) {
  spell = spelling;
}
