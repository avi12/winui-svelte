import type { Context } from "./resolve-selector.ts";
import type { Edit } from "./style-edits.ts";
import type { Declaration } from "#src/css/translate/types.js";

const NEWLINE = "\n";
const STATEMENT_END = ";";
const BLOCK_END = "}";
const QUOTES: ReadonlySet<string> = new Set(["\"", "'"]);

function offsetOf({ css, at }: {
  css: string;
  at: Declaration["at"];
}) {
  let offset = 0;
  for (let line = 1; line < at.line; line++) {
    offset = css.indexOf(NEWLINE, offset) + 1;
  }

  return offset + at.column - 1;
}

// The end of the declaration that starts at `from`: after its `;`, or before the `}` that closes the rule.
function endOf({ css, from }: {
  css: string;
  from: number;
}) {
  let depth = 0;
  let quote = "";
  for (let i = from; i < css.length; i++) {
    const character = css.charAt(i);
    const isInString = quote !== "";
    if (isInString) {
      quote = character === quote ? "" : quote;
      continue;
    }

    if (QUOTES.has(character)) {
      quote = character;
    }

    depth += character === "(" ? 1 : 0;
    depth -= character === ")" ? 1 : 0;
    const isOutside = depth <= 0;
    const isStatementEnd = isOutside && character === STATEMENT_END;
    if (isStatementEnd) {
      return i + 1;
    }

    const isBlockEnd = isOutside && character === BLOCK_END;
    if (isBlockEnd) {
      return i;
    }
  }

  return css.length;
}

/** The source offset of a declaration (in the component, not in the `<style>`). */
export function declarationOffset({ context, declaration }: {
  context: Context;
  declaration: Declaration;
}) {
  return context.cssStart + offsetOf({
    css: context.css,
    at: declaration.at
  });
}

/** The edit that takes a declaration out of the `<style>`. */
export function removeDeclaration({ context, declaration }: {
  context: Context;
  declaration: Declaration;
}) {
  const from = offsetOf({
    css: context.css,
    at: declaration.at
  });
  return {
    start: context.cssStart + from,
    end: context.cssStart + endOf({
      css: context.css,
      from
    }),
    text: ""
  } satisfies Edit;
}
