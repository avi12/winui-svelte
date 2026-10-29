import { splitCommas } from "./values.ts";
import { PseudoState } from "#src/css/translate/types.js";

const COMBINATOR_REASON = "descendant, child and sibling selectors have no WinUI meaning (a style applies to an element by its own type and classes; give the element a class)";
const CLASS_WEIGHT = 1;
const TYPE_WEIGHT = 1;
const states = new Set<string>(Object.values(PseudoState));
const identifier = /^-?[a-z_][\w-]*/iu;

/**
 * A selector a component's stylesheet may use: a compound of an element type
 * (kebab case, `text-block`), classes (`.a.b`) and at most one state. WinUI's
 * Styles apply to one element by its own type and classes, so there is no way
 * to say "inside" or "next to"; a combinator is an error that says so.
 * Svelte's scoping class (`.svelte-abc123`) is an ordinary class here: the
 * element carries it, which is what keeps one component's `.card` from
 * styling another's.
 */
export interface ParsedSelector {
  elementType: string | null;
  classes: string[];
  state: PseudoState | null;
  specificity: number;
  /** `:root`, which declares custom properties and styles no element. */
  isRoot: boolean;
}

class Compound {
  elementType: string | null = null;
  readonly classes: string[] = [];
  state: PseudoState | null = null;
  specificity = 0;
  isRoot = false;
}

// What reading one piece of a compound consumed, or why it cannot be read.
interface Step {
  length: number;
  problem: string | null;
}

function fail(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

function failedStep(problem: string) {
  return {
    length: 0,
    problem
  };
}

function readWhere({ rest, openLength, compound }: {
  rest: string;
  openLength: number;
  compound: Compound;
}) {
  const end = matchingParenthesis({
    text: rest,
    open: openLength - 1
  });
  const problem: string | null = readCompound({
    text: rest.slice(openLength, end),
    compound,
    weight: 0
  });
  return {
    length: end + 1,
    problem
  };
}

function readClass({ rest, compound, weight }: {
  rest: string;
  compound: Compound;
  weight: number;
}) {
  const name = identifier.exec(rest.slice(1))?.[0];
  const isNameMissing = name === undefined;
  if (isNameMissing) {
    return failedStep(`"${rest}" is not a class name`);
  }

  compound.classes.push(name);
  compound.specificity += weight * CLASS_WEIGHT;
  return {
    length: 1 + name.length,
    problem: null
  };
}

function readPseudoClass({ rest, compound, weight }: {
  rest: string;
  compound: Compound;
  weight: number;
}) {
  const name = identifier.exec(rest.slice(1))?.[0]?.toLowerCase();
  return {
    length: 1 + (name?.length ?? 0),
    problem: readPseudo({
      compound,
      name,
      weight
    })
  };
}

function readElementType({ rest, compound, weight }: {
  rest: string;
  compound: Compound;
  weight: number;
}) {
  const name = identifier.exec(rest)?.[0] ?? "";
  compound.elementType = name.toLowerCase();
  compound.specificity += weight * TYPE_WEIGHT;
  return {
    length: name.length,
    problem: null
  };
}

function readStep({ rest, isStart, compound, weight }: {
  rest: string;
  isStart: boolean;
  compound: Compound;
  weight: number;
}) {
  const where = /^:where\(/iu.exec(rest);
  const hasWhere = where !== null;
  if (hasWhere) {
    return readWhere({
      rest,
      openLength: where[0].length,
      compound
    });
  }

  const character = rest.charAt(0);
  const isPseudo = character === ":" && !rest.startsWith("::");
  const isUniversal = character === "*" && isStart;
  const isTypeSelector = isStart && identifier.test(rest);
  const isClassStart = character === ".";
  if (isClassStart) {
    return readClass({
      rest,
      compound,
      weight
    });
  }

  if (isPseudo) {
    return readPseudoClass({
      rest,
      compound,
      weight
    });
  }

  if (isUniversal) {
    return {
      length: 1,
      problem: null
    };
  }

  if (isTypeSelector) {
    return readElementType({
      rest,
      compound,
      weight
    });
  }

  return failedStep(
    unsupportedCharacter({
      character,
      rest
    })
  );
}

// Reads one compound from `text`; `weight` is 0 inside :where().
function readCompound({ text, compound, weight }: {
  text: string;
  compound: Compound;
  weight: number;
}) {
  let index = 0;
  while (index < text.length) {
    const step: Step = readStep({
      rest: text.slice(index),
      isStart: index === 0,
      compound,
      weight
    });
    const hasProblem = step.problem !== null;
    if (hasProblem) {
      return step.problem;
    }

    index += step.length;
  }

  return null;
}

function matchingParenthesis({ text, open }: {
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

function readPseudo({ compound, name, weight }: {
  compound: Compound;
  name: string | undefined;
  weight: number;
}) {
  const isRootPseudo = name === "root";
  if (isRootPseudo) {
    compound.isRoot = true;
    return null;
  }

  const isKnownState = name !== undefined && states.has(name);
  if (!isKnownState) {
    const known = [...states].map(state => `:${state}`).join(", ");
    return `:${name ?? ""} has no WinUI meaning (a control reports ${known})`;
  }

  const hasState = compound.state !== null;
  if (hasState) {
    return "only one state (:hover, :focus...) can be on a selector";
  }

  compound.state = stateOf(name);
  compound.specificity += weight * CLASS_WEIGHT;
  return null;
}

function stateOf(name: string) {
  return Object.values(PseudoState).find(state => state === name) ?? null;
}

function unsupportedCharacter({ character, rest }: {
  character: string;
  rest: string;
}) {
  const isCombinator = character === " " || character === ">" || character === "+" || character === "~";
  if (isCombinator) {
    return COMBINATOR_REASON;
  }

  const isAttributeSelector = character === "[";
  if (isAttributeSelector) {
    return "attribute selectors have no WinUI meaning (use a class)";
  }

  const isIdSelector = character === "#";
  if (isIdSelector) {
    return "id selectors have no WinUI meaning (use a class)";
  }

  return `"${rest}" has no WinUI meaning in a selector`;
}

/**
 * Parses a comma-separated selector list, each of which becomes a rule. Each
 * result is the parsed selector, or the reason it has no WinUI meaning.
 */
export function parseSelectorList(text: string) {
  return splitCommas(text).map(selector => {
    const compound = new Compound();
    const problem = readCompound({
      text: selector.trim(),
      compound,
      weight: 1
    });
    const hasProblem = problem !== null;
    if (hasProblem) {
      return fail(problem);
    }

    const hasMore = compound.classes.length > 0 || compound.elementType !== null || compound.state !== null;
    const isRootWithMore = compound.isRoot && hasMore;
    if (isRootWithMore) {
      return fail(":root cannot be combined with a class, type or state");
    }

    return {
      isValid: true,
      selector: {
        elementType: compound.elementType,
        classes: compound.classes,
        state: compound.state,
        specificity: compound.specificity,
        isRoot: compound.isRoot
      }
    } as const;
  });
}

const NESTING_SELECTOR = "&";

/**
 * The selector list a nested rule stands for, written out: `&` is each selector
 * of the parent, and a nested selector without one is a descendant of it (which
 * the selector parser then reports, since a Style has no "inside").
 */
export function flattenNestedSelector({ parent, child }: {
  parent: string;
  child: string;
}) {
  const parents = splitCommas(parent);
  return splitCommas(child).flatMap(part => parents.map(outer => (
    part.includes(NESTING_SELECTOR) ? part.replaceAll(NESTING_SELECTOR, outer) : `${outer} ${part}`
  ))).join(", ");
}
