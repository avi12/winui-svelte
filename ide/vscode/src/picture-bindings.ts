import { isPicture } from "./picture-paths.ts";

const IMPORT_DEFAULT = /\bimport\s+([A-Za-z_$][\w$]*)\s+from\s*(["'])([^"'\n]+)\2/gu;
const CONSTANT = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*(?:new\s+URL\(\s*)?(["'\x60])([^"'\x60$\n]*)\2/gu;

/**
 * The names a file binds to a picture that is known without running it: a default import of an image
 * (`import logo from "./logo.png"`), and a `const` of a string or of `new URL("./x.png", import.meta.url)` that
 * names a picture. The value is the text as written, which resolves like any other picture value.
 */
export function pictureBindings(text: string) {
  const bindings = new Map<string, string>();
  for (const match of [...text.matchAll(IMPORT_DEFAULT), ...text.matchAll(CONSTANT)]) {
    const [, name = "", , value = ""] = match;
    if (isPicture(value)) {
      bindings.set(name, value);
    }
  }

  return bindings;
}
