// Splitting a value at its top-level separators, outside parentheses and strings.

function depthChange(character: string) {
  const isOpeningParenthesis = character === "(";
  if (isOpeningParenthesis) {
    return 1;
  }

  return character === ")" ? -1 : 0;
}

// Splits at `separator` outside parentheses and strings; empty pieces dropped
// when the separator is whitespace.
function splitOutside({ text, isSeparator }: {
  text: string;
  isSeparator(character: string): boolean;
}) {
  const pieces: string[] = [];
  let depth = 0;
  let current = "";
  let quote = "";
  for (const character of text) {
    const isInString = quote !== "";
    if (isInString) {
      current += character;

      const isClosingQuote = character === quote;
      if (isClosingQuote) {
        quote = "";
      }

      continue;
    }

    const isQuote = character === "\"" || character === "'";
    if (isQuote) {
      quote = character;
    }

    depth += depthChange(character);
    const isSplit = depth === 0 && !isQuote && isSeparator(character);
    if (isSplit) {
      pieces.push(current);
      current = "";
    } else {
      current += character;
    }
  }

  pieces.push(current);
  return pieces.map(piece => piece.trim());
}

/** Splits a value at whitespace outside parentheses and strings. */
export function splitWords(text: string) {
  return splitOutside({
    text,
    isSeparator: character => character.trim() === ""
  }).filter(word => word !== "");
}

/** Splits a value at commas outside parentheses and strings. */
export function splitCommas(text: string) {
  return splitOutside({
    text,
    isSeparator: character => character === ","
  });
}

/** Splits a value at slashes outside parentheses and strings. */
export function splitSlash(text: string) {
  return splitOutside({
    text,
    isSeparator: character => character === "/"
  });
}

/** The index of the `)` closing the `(` at `open`; the text's length when it never closes. */
export function matchingParenthesis({ text, open }: {
  text: string;
  open: number;
}) {
  let depth = 0;
  for (let index = open; index < text.length; index++) {
    depth += text[index] === "(" ? 1 : 0;
    depth -= text[index] === ")" ? 1 : 0;

    const isBalanced = depth === 0;
    if (isBalanced) {
      return index;
    }
  }

  return text.length;
}
