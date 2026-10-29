import type { TemplateElement } from "./template-elements.ts";
import {
  Combinator,
  parseComplexSelector,
  splitSelectorList,
  STATE_PSEUDO_CLASSES
} from "#src/css/parse/complex-selector.js";
import type { Compound } from "#src/css/parse/complex-selector.js";

/** A selector whose match cannot be told from the markup alone, with why. */
export class UnresolvableSelector extends Error {}

/** Whether an element matches: yes, no, or not knowable from the markup (with why). */
type Match =
  | {
    kind: "yes";
  }
  | {
    kind: "no";
  }
  | {
    kind: "maybe";
    reason: string;
  };

const YES: Match = { kind: "yes" };
const NO: Match = { kind: "no" };
const RADIX = 10;
const OFFSET_GROUP = 3;
const NTH_PATTERN = /^\s*([+-]?\d*)n\s*(?:([+-])\s*(\d+))?\s*$/iu;
const PLAIN_NUMBER = /^\s*\d+\s*$/u;
const KEYWORD_NTH = new Map([
  ["odd", {
    step: 2,
    offset: 1
  }],
  ["even", {
    step: 2,
    offset: 0
  }]
]);
const POSITIONAL = new Set(["first-child", "last-child", "only-child", "nth-child", "nth-last-child"]);
const LISTS = new Set(["is", "where", "not"]);

function maybe(reason: string) {
  return {
    kind: "maybe",
    reason
  } satisfies Match;
}

// Every match must hold: one no is no, else one maybe is maybe.
function allOf(matches: readonly Match[]) {
  let result: Match = YES;
  for (const match of matches) {
    const isNo = match.kind === "no";
    if (isNo) {
      return NO;
    }

    const isUncertain = match.kind === "maybe" && result.kind === "yes";
    if (isUncertain) {
      result = match;
    }
  }

  return result;
}

// One match is enough: one yes is yes, else one maybe is maybe.
function anyOf(matches: readonly Match[]) {
  let result: Match = NO;
  for (const match of matches) {
    const isYes = match.kind === "yes";
    if (isYes) {
      return YES;
    }

    const isUncertain = match.kind === "maybe" && result.kind === "no";
    if (isUncertain) {
      result = match;
    }
  }

  return result;
}

function matchOf(isMatch: boolean) {
  return isMatch ? YES : NO;
}

function stepOf(raw: string) {
  const isImplicit = raw === "" || raw === "+";
  if (isImplicit) {
    return 1;
  }

  return raw === "-" ? -1 : Number.parseInt(raw, RADIX);
}

// `an+b`, `odd`, `even` or a number: the step and offset, or null for anything else.
function parseNth(argument: string) {
  const keyword = KEYWORD_NTH.get(argument.trim().toLowerCase());
  const isKeyword = keyword !== undefined;
  if (isKeyword) {
    return keyword;
  }

  const isPlain = PLAIN_NUMBER.test(argument);
  if (isPlain) {
    return {
      step: 0,
      offset: Number.parseInt(argument, RADIX)
    };
  }

  const match = NTH_PATTERN.exec(argument);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const sign = match[2] === "-" ? -1 : 1;
  return {
    step: stepOf(match[1] ?? ""),
    offset: sign * Number.parseInt(match[OFFSET_GROUP] ?? "0", RADIX)
  };
}

function isNthPosition({ position, step, offset }: {
  position: number;
  step: number;
  offset: number;
}) {
  const distance = position - offset;
  const isFixed = step === 0;
  if (isFixed) {
    return distance === 0;
  }

  const index = distance / step;
  return index >= 0 && Number.isInteger(index);
}

function describe(element: TemplateElement) {
  return `<${element.name}>`;
}

function classMatch({ element, name }: {
  element: TemplateElement;
  name: string;
}) {
  if (element.classes.includes(name)) {
    return YES;
  }

  return element.hasDynamicClass ? maybe(
    `${describe(element)} has its class set by an expression, a class: directive or a spread, so .${name} cannot be told at build time`
  ) : NO;
}

// Type and classes: what :is(), :where() and :not() may hold.
function simpleMatch({ element, compound }: {
  element: TemplateElement;
  compound: Compound;
}) {
  const hasPseudoClass = compound.pseudoClasses.length > 0;
  if (hasPseudoClass) {
    throw new UnresolvableSelector("a pseudo-class inside :is(), :where() or :not() has no WinUI meaning (write a type and classes)");
  }

  const isTypeMatch = compound.elementType === null || compound.elementType === element.name;
  if (!isTypeMatch) {
    return NO;
  }

  return allOf(
    compound.classes.map(name => classMatch({
      element,
      name
    }))
  );
}

function listMatch({ element, argument }: {
  element: TemplateElement;
  argument: string;
}) {
  const matches = splitSelectorList(argument).map(selector => {
    const parsed = parseComplexSelector(selector);
    const [compound] = parsed.isValid ? parsed.compounds : [];
    const isSingle = parsed.isValid && parsed.compounds.length === 1 && compound !== undefined;
    if (!isSingle) {
      throw new UnresolvableSelector(`"${selector}" inside :is(), :where() or :not() must be one compound (a type and classes)`);
    }

    return simpleMatch({
      element,
      compound
    });
  });
  return anyOf(matches);
}

function negated(match: Match) {
  const isUncertain = match.kind === "maybe";
  if (isUncertain) {
    return match;
  }

  return matchOf(match.kind === "no");
}

function positionMatch({ element, name, argument }: {
  element: TemplateElement;
  name: string;
  argument: string | null;
}) {
  const { level } = element;
  if (!level.isStatic) {
    return maybe(`${describe(element)} has siblings that depend on an {#if}, an {#each}, a component or a snippet, or is the root of the component, so its position is not fixed: give it a class`);
  }

  const siblings = level.items.filter(item => item !== null);
  const index = siblings.indexOf(element);
  const isFirst = index === 0;
  const isLast = index === siblings.length - 1;
  const isNth = name === "nth-child" || name === "nth-last-child";
  const nth = isNth ? parseNth(argument ?? "") : null;
  const isUnreadable = isNth && nth === null;
  if (isUnreadable) {
    throw new UnresolvableSelector(`:${name}(${argument ?? ""}) is not an+b, odd or even`);
  }

  const results = new Map<string, boolean>([
    ["first-child", isFirst],
    ["last-child", isLast],
    ["only-child", isFirst && isLast]
  ]);
  const hasNth = nth !== null;
  if (hasNth) {
    const position = name === "nth-child" ? index + 1 : siblings.length - index;
    return matchOf(
      isNthPosition({
        position,
        ...nth
      })
    );
  }

  return matchOf(results.get(name) ?? false);
}

function pseudoMatch({ element, name, argument, isSubject }: {
  element: TemplateElement;
  name: string;
  argument: string | null;
  isSubject: boolean;
}) {
  if (STATE_PSEUDO_CLASSES.has(name)) {
    return isSubject ? YES : maybe(`:${name} on an element other than the one styled has no WinUI meaning (a Style cannot see another element's state)`);
  }

  if (POSITIONAL.has(name)) {
    return positionMatch({
      element,
      name,
      argument
    });
  }

  if (LISTS.has(name)) {
    const listed = listMatch({
      element,
      argument: argument ?? ""
    });
    return name === "not" ? negated(listed) : listed;
  }

  const isHas = name === "has";
  throw new UnresolvableSelector(
    isHas ? ":has() has no WinUI meaning (a Style cannot depend on what an element contains: give the element a class)" : `:${name} has no WinUI meaning in a selector`
  );
}

function compoundMatch({ element, compound, isSubject }: {
  element: TemplateElement;
  compound: Compound;
  isSubject: boolean;
}) {
  const isTypeMatch = compound.elementType === null || compound.elementType === element.name;
  if (!isTypeMatch) {
    return NO;
  }

  const classes = compound.classes.map(name => classMatch({
    element,
    name
  }));
  const pseudoClasses = compound.pseudoClasses.map(({ name, argument }) => pseudoMatch({
    element,
    name,
    argument,
    isSubject
  }));
  return allOf([...classes, ...pseudoClasses]);
}

function ancestorsOf(element: TemplateElement) {
  const ancestors: TemplateElement[] = [];
  for (let ancestor = element.parent; ancestor !== null; ancestor = ancestor.parent) {
    ancestors.push(ancestor);
  }

  return ancestors;
}

// The elements an element is related to by a combinator, or null when its siblings are not fixed.
function relatives({ element, combinator }: {
  element: TemplateElement;
  combinator: Combinator | null;
}) {
  const parent = element.parent === null ? [] : [element.parent];
  const isChild = combinator === Combinator.CHILD;
  if (isChild) {
    return parent;
  }

  const isDescendant = combinator === Combinator.DESCENDANT;
  if (isDescendant) {
    return ancestorsOf(element);
  }

  const { level } = element;
  if (!level.isStatic) {
    return null;
  }

  const siblings = level.items.filter(item => item !== null);
  const before = siblings.slice(0, siblings.indexOf(element));
  return combinator === Combinator.NEXT_SIBLING ? before.slice(-1) : before;
}

// How well the elements before this one in the selector (already matched, with their certainty) relate to it.
function relation({ element, combinator, earlier }: {
  element: TemplateElement;
  combinator: Combinator | null;
  earlier: ReadonlyMap<TemplateElement, Match>;
}) {
  const related = relatives({
    element,
    combinator
  });
  const isUnknown = related === null;
  if (isUnknown) {
    return earlier.size === 0 ? NO : maybe(`${describe(element)} has siblings that depend on an {#if}, an {#each}, a component or a snippet, so what is next to it is not fixed: give it a class`);
  }

  return anyOf(related.map(candidate => earlier.get(candidate) ?? NO));
}

/**
 * The elements a complex selector styles, matched left to right against the
 * markup. Throws UnresolvableSelector where the markup does not decide (a class
 * set by an expression on an element that otherwise matches, siblings in an
 * `{#each}`, `:has()`).
 */
export function matchingElements({ compounds, elements }: {
  compounds: readonly Compound[];
  elements: readonly TemplateElement[];
}) {
  let earlier = new Map<TemplateElement, Match>();
  for (const [index, compound] of compounds.entries()) {
    const matched = new Map<TemplateElement, Match>();
    for (const element of elements) {
      const own = compoundMatch({
        element,
        compound,
        isSubject: index === compounds.length - 1
      });
      const related = index === 0 ? YES : relation({
        element,
        combinator: compound.combinator,
        earlier
      });
      const result = allOf([own, related]);
      const isCandidate = result.kind !== "no";
      if (isCandidate) {
        matched.set(element, result);
      }
    }

    earlier = matched;
  }

  const unresolved = [...earlier.values()].find(match => match.kind === "maybe");
  const isUnresolved = unresolved !== undefined;
  if (isUnresolved) {
    throw new UnresolvableSelector(unresolved.reason);
  }

  return [...earlier.keys()];
}
