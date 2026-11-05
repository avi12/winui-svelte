import { rememberFont } from "#src/font-registry.js";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Finds the file of a font an app ships and registers it (`font-registry.ts`
// holds the table and the spelling WinUI needs).

const FILE_PROTOCOL = "file:";
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

  rememberFont({
    family,
    file
  });
  return file;
}
