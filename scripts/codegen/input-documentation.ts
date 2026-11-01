import { readFileSync } from "node:fs";
import path from "node:path";

// The one-line comment of each `...Input` type of the converters, which a prop
// of that type repeats in its own hover: the editor shows a type's name, not
// the comment on the type.

const COMPONENTS_FOLDER = path.resolve(import.meta.dirname, "../../src/components");
const SOURCE_FILES = ["convert.ts", "values.ts"];
const INPUT_COMMENT = /^\/\*\* (.+) \*\/\nexport type (\w+Input)\b/gm;

let comments: Map<string, string> | undefined;

const FIRST_WORD = /^[A-Z](?=[a-z])/;

function lowerFirst(text: string) {
  return text.replace(FIRST_WORD, letter => letter.toLowerCase());
}

function readComments() {
  const found = new Map<string, string>();
  for (const file of SOURCE_FILES) {
    const source = readFileSync(path.join(COMPONENTS_FOLDER, file), "utf8");
    for (const [, text, name] of source.matchAll(INPUT_COMMENT)) {
      const isComment = text !== undefined && name !== undefined;
      if (isComment) {
        found.set(name, lowerFirst(text));
      }
    }
  }
  return found;
}

/**
 * The comment written above an input type in the converters, started in lower
 * case so that it follows "Accepts", or undefined where it has none.
 */
export function inputDocumentationOf(name: string) {
  comments ??= readComments();
  return comments.get(name);
}
