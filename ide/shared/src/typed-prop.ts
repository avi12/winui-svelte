import { declaresAsInputType, importedComponents } from "./markup-scan.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Whether a prop takes the input type: WinUI's own component lists it (`isOwn`), or a component of the project
 * whose file declares the prop with that type, found by following the import of its tag.
 */
export async function isTypedProp({ isOwn, inputType, tag, attribute, documentText, documentFile }: {
  isOwn: boolean;
  inputType: string;
  tag: string;
  attribute: string;
  documentText: string;
  documentFile: string;
}) {
  if (isOwn) {
    return true;
  }

  const imported = importedComponents(documentText).get(tag);
  const isNotRelative = imported === undefined || !imported.startsWith(".");
  if (isNotRelative) {
    return false;
  }

  const source = await readFile(path.resolve(path.dirname(documentFile), imported), "utf8").catch(() => undefined);
  return source !== undefined && declaresAsInputType({
    source,
    prop: attribute,
    inputType
  });
}
