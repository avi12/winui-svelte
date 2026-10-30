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

// What an end character adds to its offset: a `;` is part of the declaration, the `}` closes the rule.
const END_OFFSETS: ReadonlyMap<string, number> = new Map([[STATEMENT_END, 1], [BLOCK_END, 0]]);
const DEPTH_STEPS: ReadonlyMap<string, number> = new Map([["(", 1], [")", -1]]);

// The string quote open after `character`: a quote opens one, the same quote closes it.
function quoteAfter({ quote, character }: {
  quote: string;
  character: string;
}) {
  const isInString = quote !== "";
  if (isInString) {
    return character === quote ? "" : quote;
  }

  return QUOTES.has(character) ? character : "";
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
    quote = quoteAfter({
      quote,
      character
    });
    if (isInString) {
      continue;
    }

    depth += DEPTH_STEPS.get(character) ?? 0;
    const endOffset = END_OFFSETS.get(character);
    const isEnd = depth <= 0 && endOffset !== undefined;
    if (isEnd) {
      return i + endOffset;
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
