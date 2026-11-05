import { readFile } from "node:fs/promises";
import path from "node:path";
import { declaresAsGlyphInput, importedComponents } from "./glyph-scan.ts";
import { isGlyphAttribute } from "./glyph-table.ts";

/**
 * Whether a prop takes a GlyphInput: WinUI's own icon components, or a component of the project whose file
 * declares the prop with that type, found by following the import of its tag.
 */
export async function isGlyphProp({ tag, attribute, documentText, documentFile }: {
  tag: string;
  attribute: string;
  documentText: string;
  documentFile: string;
}) {
  const isOwn = isGlyphAttribute({
    tag,
    attribute
  });
  if (isOwn) {
    return true;
  }

  const imported = importedComponents(documentText).get(tag);
  if (imported === undefined || !imported.startsWith(".")) {
    return false;
  }

  const source = await readFile(path.resolve(path.dirname(documentFile), imported), "utf8").catch(() => undefined);
  return source !== undefined && declaresAsGlyphInput({
    source,
    prop: attribute
  });
}
