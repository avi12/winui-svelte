import { matchingParenthesis, splitCommas } from "./split.ts";

/** How a compound relates to the one before it. */
export const Combinator = {
  DESCENDANT: " ",
  CHILD: ">",
  NEXT_SIBLING: "+",
  LATER_SIBLING: "~"
} as const;

/** One of the combinators in `Combinator`. */
export type Combinator = (typeof Combinator)[keyof typeof Combinator];

/** A pseudo-class of a compound, with the text in its parentheses when it has any. */
export interface PseudoClass {
  name: string;
  argument: string | null;
}

/** A type, classes and pseudo-classes that one element must all satisfy. */
export interface Compound {
  /** How this compound relates to the previous one; null for the first. */
  combinator: Combinator | null;
  elementType: string | null;
  classes: string[];
  pseudoClasses: PseudoClass[];
}

/** The pseudo-classes that report a control's state, which a generated class cannot stand for. */
export const STATE_PSEUDO_CLASSES: ReadonlySet<string> = new Set([
  "hover",
  "active",
  "focus",
  "focus-visible",
  "disabled",
  "checked"
]);

const EXPLICIT_COMBINATORS: ReadonlyMap<string, Combinator> = new Map([
  [">", Combinator.CHILD],
  ["+", Combinator.NEXT_SIBLING],
  ["~", Combinator.LATER_SIBLING]
]);
const NAME_CHARACTER = /[\w-]/u;

function isSpace(character: string) {
  return character.trim() === "";
}

function readName({ text, start }: {
  text: string;
  start: number;
}) {
  let end = start;
  while (end < text.length && NAME_CHARACTER.test(text[end] ?? "")) {
    end++;
  }

  return end;
}

function readSpace({ text, start }: {
  text: string;
  start: number;
}) {
  let end = start;
  while (end < text.length && isSpace(text[end] ?? "")) {
    end++;
  }

  return end;
}

function failure(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

function readPseudoClass({ text, index, compound }: {
  text: string;
  index: number;
  compound: Compound;
}) {
  const nameEnd = readName({
    text,
    start: index + 1
  });
  const hasArgument = text[nameEnd] === "(";
  const close = hasArgument ? matchingParenthesis({
    text,
    open: nameEnd
  }) : nameEnd;
  compound.pseudoClasses.push({
    name: text.slice(index + 1, nameEnd).toLowerCase(),
    argument: hasArgument ? text.slice(nameEnd + 1, close) : null
  });
  return hasArgument ? close + 1 : nameEnd;
}

function readType({ text, index, compound }: {
  text: string;
  index: number;
  compound: Compound;
}) {
  const isUniversal = text[index] === "*";
  const end = isUniversal ? index + 1 : readName({
    text,
    start: index
  });
  compound.elementType = isUniversal ? null : text.slice(index, end).toLowerCase();
  return end;
}

// Reads the piece of a compound at `index`; the index after it, or null when it is not one.
function readPiece({ text, index, compound }: {
  text: string;
  index: number;
  compound: Compound;
}) {
  const character = text[index] ?? "";
  const isClass = character === ".";
  const isPseudo = character === ":" && text[index + 1] !== ":";
  const isType = NAME_CHARACTER.test(character) || character === "*";
  if (isClass) {
    const end = readName({
      text,
      start: index + 1
    });
    compound.classes.push(text.slice(index + 1, end));
    return end;
  }

  if (isPseudo) {
    return readPseudoClass({
      text,
      index,
      compound
    });
  }

  const isFirst = compound.elementType === null && compound.classes.length === 0 && compound.pseudoClasses.length === 0;
  const canBeType = isType && isFirst;
  return canBeType ? readType({
    text,
    index,
    compound
  }) : null;
}

// Reads one compound from `start`; `end` is where it stops (a space, a combinator or the end).
function readCompound({ text, start }: {
  text: string;
  start: number;
}) {
  const compound: Compound = {
    combinator: null,
    elementType: null,
    classes: [],
    pseudoClasses: []
  };
  let index = start;
  while (index < text.length) {
    const character = text[index] ?? "";
    const isEnd = isSpace(character) || EXPLICIT_COMBINATORS.has(character);
    if (isEnd) {
      break;
    }

    const next = readPiece({
      text,
      index,
      compound
    });
    const isUnreadable = next === null;
    if (isUnreadable) {
      return failure(`"${text.slice(index)}" has no WinUI meaning in a selector (use a type, classes and pseudo-classes)`);
    }

    index = next;
  }

  return {
    isValid: true,
    compound,
    end: index
  } as const;
}

/**
 * A complex selector (`.list > .item:first-child`) as its compounds and the
 * combinators between them, or why it cannot be read.
 */
export function parseComplexSelector(text: string) {
  const compounds: Compound[] = [];
  const source = text.trim();
  let index = 0;
  let combinator: Combinator | null = null;
  while (index < source.length) {
    const spaceEnd = readSpace({
      text: source,
      start: index
    });
    const hasSpace = spaceEnd > index;
    index = spaceEnd;
    const explicit = EXPLICIT_COMBINATORS.get(source[index] ?? "");
    const isExplicit = explicit !== undefined;
    if (isExplicit) {
      combinator = explicit;
      index++;
      continue;
    }

    const read = readCompound({
      text: source,
      start: index
    });
    const isUnreadable = !read.isValid || read.end === index;
    if (isUnreadable) {
      return read.isValid ? failure(`"${source}" cannot be read as a selector`) : read;
    }

    const implicit = hasSpace ? Combinator.DESCENDANT : null;
    read.compound.combinator = compounds.length === 0 ? null : combinator ?? implicit;
    compounds.push(read.compound);
    combinator = null;
    index = read.end;
  }

  return {
    isValid: true,
    compounds
  } as const;
}

/** A selector list's selectors, split at its top-level commas. */
export function splitSelectorList(text: string) {
  return splitCommas(text).filter(selector => selector !== "");
}
