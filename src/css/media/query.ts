// The one media query parser and evaluator: `@media` rules, the CSS runtime's
// environment watcher and `matchMedia` all run through it. It reads the
// grammar of Media Queries 4 (types, `not`/`only`/`and`/`or`, comma lists,
// legacy `min-`/`max-` and range syntax, length/resolution/ratio units), and
// asks the feature table (features.ts) for each answer.

import type { FeatureAnswer, MediaChange, MediaFeature, MediaInputs } from "./features.ts";
import { MEDIA_FEATURES, MediaUnit } from "./features.ts";
import { splitCommas } from "#src/css/parse/split.js";

type NodeParser = (input: {
  text: string;
  unknown: string[];
}) => MediaNode | null;

type Comparison = "=" | "<" | "<=" | ">" | ">=";

/** One node of a parsed query. */
export type MediaNode =
  | {
    readonly kind: "type";
    readonly name: string;
  }
  | {
    readonly kind: "boolean";
    readonly feature: string;
  }
  | {
    readonly kind: "test";
    readonly feature: string;
    readonly operator: Comparison;
    readonly value: string;
  }
  | {
    readonly kind: "not";
    readonly node: MediaNode;
  }
  | {
    readonly kind: "and" | "or";
    readonly nodes: readonly MediaNode[];
  };

/** A parsed media query list, and the names it uses that the table does not know. */
export interface ParsedMedia {
  readonly queries: readonly MediaNode[];
  readonly unknown: readonly string[];
}

const CHAIN_PARTS = 5;
const COMPARISON_PARTS = 3;
const CSS_DPI = 96;
const CM_PER_INCH = 2.54;
const TRUE_TYPES = new Set(["all", "screen"]);
const FALSE_TYPES = new Set(["print", "speech", "tty", "tv", "projection", "handheld", "braille", "embossed", "aural"]);
const PREFIXED = /^(?<webkit>-webkit-)?(?:(?<limit>min|max)-)?(?<base>.+)$/u;
const OPERATOR = /\s*(<=|>=|<|>|=)\s*/u;
const FEATURE_NAME = /^[a-z-]+$/u;
const OPERATORS = new Map<string, Comparison>([
  ["=", "="],
  ["<", "<"],
  ["<=", "<="],
  [">", ">"],
  [">=", ">="]
]);
const FLIPPED = new Map<string, Comparison>([
  ["<", ">"],
  ["<=", ">="],
  [">", "<"],
  [">=", "<="],
  ["=", "="]
]);
const LIMIT_OPERATORS = new Map<string | undefined, Comparison>([
  ["min", ">="],
  ["max", "<="]
]);

function comparisonOf(text: string) {
  return OPERATORS.get(text) ?? "=";
}

function flip(operator: string) {
  return FLIPPED.get(operator) ?? "=";
}

// Splits `(a) and (b)` / `not (a)` into its parenthesised groups and words.
function conditionTokens(text: string) {
  const tokens: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of text) {
    const isOpening = character === "(";
    const isClosing = character === ")";
    const isSeparator = /\s/u.test(character) && depth === 0;
    depth += Number(isOpening) - Number(isClosing);

    if (isSeparator) {
      const isPending = current !== "";
      if (isPending) {
        tokens.push(current);
      }

      current = "";
      continue;
    }

    current += character;
  }

  const isPending = current !== "";
  if (isPending) {
    tokens.push(current);
  }

  return tokens;
}

function nameOf({ base, limit, isWebkit }: {
  base: string;
  limit: string | undefined;
  isWebkit: boolean;
}) {
  return {
    feature: `${isWebkit ? "-webkit-" : ""}${base}`,
    operator: LIMIT_OPERATORS.get(limit) ?? "="
  };
}

function featureTest({ name, operator, value, unknown }: {
  name: string;
  operator: Comparison;
  value: string;
  unknown: string[];
}) {
  const parts = PREFIXED.exec(name)?.groups ?? {};
  const resolved = nameOf({
    base: parts["base"] ?? name,
    limit: parts["limit"],
    isWebkit: parts["webkit"] !== undefined
  });
  const direct = MEDIA_FEATURES.get(name);
  const isDirect = direct !== undefined;
  if (isDirect) {
    return {
      kind: "test",
      feature: name,
      operator,
      value
    } satisfies MediaNode;
  }

  const prefixed = MEDIA_FEATURES.get(resolved.feature);
  const isRange = prefixed?.kind === "range" && parts["limit"] !== undefined;
  if (!isRange) {
    unknown.push(name);
  }

  return {
    kind: "test",
    feature: resolved.feature,
    operator: resolved.operator,
    value
  } satisfies MediaNode;
}

function isFeatureName(text: string) {
  return FEATURE_NAME.test(text) || MEDIA_FEATURES.has(text);
}

// `width >= 600px`, `600px <= width`, `400px <= width <= 700px`.
function rangeNode({ parts, unknown }: {
  parts: readonly string[];
  unknown: string[];
}) {
  const isChain = parts.length === CHAIN_PARTS;
  const [first = "", firstOperator = "", second = "", secondOperator = "", third = ""] = parts;
  if (isChain) {
    const low = featureTest({
      name: second,
      operator: flip(firstOperator),
      value: first,
      unknown
    });
    const high = featureTest({
      name: second,
      operator: comparisonOf(secondOperator),
      value: third,
      unknown
    });
    return {
      kind: "and",
      nodes: [low, high]
    } satisfies MediaNode;
  }

  const isNameFirst = MEDIA_FEATURES.has(first) || (isFeatureName(first) && !MEDIA_FEATURES.has(second));
  return isNameFirst ? featureTest({
    name: first,
    operator: comparisonOf(firstOperator),
    value: second,
    unknown
  }) : featureTest({
    name: second,
    operator: flip(firstOperator),
    value: first,
    unknown
  });
}

function featureNode({ text, unknown }: {
  text: string;
  unknown: string[];
}) {
  const colon = /^(?<name>[\w-]+)\s*:\s*(?<value>.+)$/u.exec(text)?.groups;
  const isColonForm = colon !== undefined;
  if (isColonForm) {
    return featureTest({
      name: colon["name"] ?? "",
      operator: "=",
      value: colon["value"] ?? "",
      unknown
    });
  }

  const parts = text.split(OPERATOR);
  const isRange = parts.length === COMPARISON_PARTS || parts.length === CHAIN_PARTS;
  if (isRange) {
    return rangeNode({
      parts,
      unknown
    });
  }

  const isName = FEATURE_NAME.test(text) || text.startsWith("-webkit-");
  if (!isName) {
    return null;
  }

  const isKnown = MEDIA_FEATURES.has(text);
  if (!isKnown) {
    unknown.push(text);
  }

  return {
    kind: "boolean",
    feature: text
  } satisfies MediaNode;
}

// The condition parser comes in as a parameter: a parser that names the one that calls it
// has a type TypeScript cannot infer, and a return type is not written here.
function groupNode({ group, unknown, parseCondition }: {
  group: string;
  unknown: string[];
  parseCondition: NodeParser;
}) {
  const isGroup = group.startsWith("(") && group.endsWith(")");
  if (!isGroup) {
    return null;
  }

  const inner = group.slice(1, -1).trim();
  const isNested = inner.startsWith("(") || /^not\s/u.test(inner);
  return isNested ? parseCondition({
    text: inner,
    unknown
  }) : featureNode({
    text: inner,
    unknown
  });
}

// The groups of `(a) and (b)` and the one operator between them; null where it is not that form.
function combinedNodes({ tokens, unknown }: {
  tokens: readonly string[];
  unknown: string[];
}) {
  const nodes: MediaNode[] = [];
  let operator: "and" | "or" = "and";
  for (const [index, token] of tokens.entries()) {
    const isOperatorSlot = index % 2 === 1;
    if (isOperatorSlot) {
      const isFirstOperator = index === 1;
      const isCombinator = token === "and" || token === "or";
      const isMixed = !isFirstOperator && operator !== token;
      const isInvalid = !isCombinator || isMixed;
      if (isInvalid) {
        return null;
      }

      operator = token;
      continue;
    }

    const node = groupNode({
      group: token,
      unknown,
      parseCondition: conditionNode
    });
    const isUnreadable = node === null;
    if (isUnreadable) {
      return null;
    }

    nodes.push(node);
  }

  return {
    nodes,
    operator
  };
}

function conditionNode({ text, unknown }: {
  text: string;
  unknown: string[];
}) {
  const tokens = conditionTokens(text);
  const [head, ...rest] = tokens;
  const isNegation = head === "not";
  if (isNegation) {
    const negated = groupNode({
      group: rest.join(" "),
      unknown,
      parseCondition: conditionNode
    });
    const isUnreadable = negated === null;
    return isUnreadable ? null : {
      kind: "not",
      node: negated
    } satisfies MediaNode;
  }

  const combined = combinedNodes({
    tokens,
    unknown
  });
  const isUnreadable = combined === null;
  if (isUnreadable) {
    return null;
  }

  const { nodes, operator } = combined;
  const [only] = nodes;
  const isSingle = nodes.length === 1 && only !== undefined;
  if (isSingle) {
    return only;
  }

  const isEmpty = nodes.length === 0;
  return isEmpty ? null : {
    kind: operator,
    nodes
  } satisfies MediaNode;
}

function queryNode({ text, unknown }: {
  text: string;
  unknown: string[];
}) {
  const lowered = text.trim().toLowerCase();
  const isCondition = lowered.startsWith("(") || /^not\s*\(/u.test(lowered);
  if (isCondition) {
    return conditionNode({
      text: lowered,
      unknown
    });
  }

  const typed = /^(?<modifier>not|only)?\s*(?<type>[a-z]+)(?:\s+and\s+(?<condition>.+))?$/u.exec(lowered)?.groups;
  const name = typed?.["type"] ?? "";
  const isKnownType = TRUE_TYPES.has(name) || FALSE_TYPES.has(name);
  const isTypeMissing = typed === undefined || !isKnownType;
  if (isTypeMissing) {
    return null;
  }

  const type = {
    kind: "type",
    name
  } satisfies MediaNode;
  const condition = typed["condition"];
  const hasCondition = condition !== undefined;
  const inner = hasCondition ? conditionNode({
    text: condition,
    unknown
  }) : type;
  const isUnreadable = inner === null;
  if (isUnreadable) {
    return null;
  }

  const both = hasCondition ? {
    kind: "and",
    nodes: [type, inner]
  } satisfies MediaNode : type;
  const isNegated = typed["modifier"] === "not";
  return isNegated ? {
    kind: "not",
    node: both
  } satisfies MediaNode : both;
}

const NEVER: MediaNode = {
  kind: "not",
  node: {
    kind: "type",
    name: "all"
  }
};

/**
 * Parses a media query list (`screen and (min-width: 600px), print`). A query
 * that does not parse never matches, as in CSS; `unknown` names the features
 * the table cannot answer, which a build reports.
 */
export function parseMediaList(text: string) {
  const unknown: string[] = [];
  const queries = splitCommas(text).map(query => queryNode({
    text: query,
    unknown
  }) ?? NEVER);
  return {
    queries,
    unknown
  } satisfies ParsedMedia;
}

// A value in the unit of its feature; null where it is not one.
function amountOf({ text, unit }: {
  text: string;
  unit: MediaUnit | undefined;
}) {
  const trimmed = text.trim();
  const isRatio = unit === MediaUnit.ratio;
  if (isRatio) {
    const [numerator = "", denominator = "1"] = trimmed.split("/");
    const ratio = Number(numerator) / Number(denominator);
    return Number.isFinite(ratio) ? ratio : null;
  }

  const match = /^(?<number>-?\d*\.?\d+)(?<suffix>[a-z]*)$/u.exec(trimmed)?.groups;
  const amount = Number(match?.["number"]);
  const suffix = match?.["suffix"] ?? "";
  const multipliers = new Map<string, number>(unit === MediaUnit.resolution ? [
    ["dppx", 1],
    ["x", 1],
    ["dpi", 1 / CSS_DPI],
    ["dpcm", CM_PER_INCH / CSS_DPI]
  ] : [
    ["px", 1],
    ["", 1]
  ]);
  const multiplier = unit === MediaUnit.number ? 1 : multipliers.get(suffix);
  const isReadable = match !== undefined && multiplier !== undefined && Number.isFinite(amount);
  return isReadable ? amount * multiplier : null;
}

function compare({ actual, operator, target }: {
  actual: number;
  operator: Comparison;
  target: number;
}) {
  const results = new Map<Comparison, boolean>([
    ["=", actual === target],
    ["<", actual < target],
    ["<=", actual <= target],
    [">", actual > target],
    [">=", actual >= target]
  ]);
  return results.get(operator) ?? false;
}

function holdsKeyword({ feature, answer, value }: {
  feature: MediaFeature;
  answer: FeatureAnswer;
  value: string;
}) {
  const answers = keywordsOf(answer);
  const { order } = feature;
  const isUnordered = order === undefined;
  if (isUnordered) {
    return answers.includes(value);
  }

  const wanted = order.indexOf(value);
  const reached = Math.max(...answers.map(each => order.indexOf(each)));
  return wanted >= 0 && reached >= wanted;
}

function keywordsOf(answer: FeatureAnswer) {
  const isKeyword = typeof answer === "string";
  if (isKeyword) {
    return [answer];
  }

  const isList = typeof answer === "object" && answer !== null;
  return isList ? answer : [];
}

// Whether a number-valued feature is true on its own: anything but zero.
function isBooleanHeld({ feature, answer }: {
  feature: MediaFeature;
  answer: FeatureAnswer;
}) {
  const isUnknown = answer === null;
  if (isUnknown) {
    return false;
  }

  const isNumber = typeof answer === "number";
  if (isNumber) {
    return answer !== 0;
  }

  return keywordsOf(answer).some(each => each !== feature.falseKeyword && each !== "none");
}

function evaluateTest({ node, inputs }: {
  node: Extract<MediaNode, { kind: "test" | "boolean" }>;
  inputs: MediaInputs;
}) {
  const feature = MEDIA_FEATURES.get(node.feature);
  const isFeatureUnknown = feature === undefined;
  if (isFeatureUnknown) {
    return null;
  }

  const answer = feature.read(inputs);
  const isBoolean = node.kind === "boolean";
  if (isBoolean) {
    return isBooleanHeld({
      feature,
      answer
    });
  }

  const value = node.value.trim().toLowerCase();
  const isRange = feature.kind === "range";
  if (!isRange) {
    const isComparison = node.operator !== "=";
    return isComparison ? null : holdsKeyword({
      feature,
      answer,
      value
    });
  }

  const target = amountOf({
    text: value,
    unit: feature.unit
  });
  const isTargetUnreadable = target === null;
  if (isTargetUnreadable) {
    return null;
  }

  const isNumber = typeof answer === "number";
  return isNumber ? compare({
    actual: answer,
    operator: node.operator,
    target
  }) : false;
}

function childrenOf(node: MediaNode) {
  const isNegation = node.kind === "not";
  if (isNegation) {
    return [node.node];
  }

  const isGroup = node.kind === "and" || node.kind === "or";
  return isGroup ? node.nodes : [];
}

// A node whose children are known: true, false, or null (unknown), which a query list treats as false.
function combine({ node, children, inputs }: {
  node: MediaNode;
  children: ReadonlyArray<boolean | null>;
  inputs: MediaInputs;
}) {
  switch (node.kind) {
    case "type":
      return TRUE_TYPES.has(node.name);
    case "not": {
      const [isHeld = null] = children;
      const isUnknown = isHeld === null;
      return isUnknown ? null : !isHeld;
    }
    case "and":
    case "or": {
      const isAnd = node.kind === "and";
      const isDecisiveFound = children.includes(!isAnd);
      if (isDecisiveFound) {
        return !isAnd;
      }

      return children.includes(null) ? null : isAnd;
    }
    default:
      return evaluateTest({
        node,
        inputs
      });
  }
}

// Three-valued as in the spec. The tree is walked children first with a stack, not by recursion.
function evaluateNode({ node, inputs }: {
  node: MediaNode;
  inputs: MediaInputs;
}) {
  const walked: MediaNode[] = [];
  const pending = [node];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    walked.push(current);
    pending.push(...childrenOf(current));
  }

  const results = new Map<MediaNode, boolean | null>();
  for (const current of walked.reverse()) {
    results.set(
      current, combine({
        node: current,
        children: childrenOf(current).map(child => results.get(child) ?? null),
        inputs
      })
    );
  }

  return results.get(node) ?? null;
}

/** Whether any query of the list holds against the inputs. */
export function mediaListMatches({ parsed, inputs }: {
  parsed: ParsedMedia;
  inputs: MediaInputs;
}) {
  return parsed.queries.some(node => evaluateNode({
    node,
    inputs
  }) === true);
}

function collectFeatures({ node, names }: {
  node: MediaNode;
  names: Set<string>;
}) {
  const isGroup = node.kind === "and" || node.kind === "or";
  if (isGroup) {
    for (const each of node.nodes) {
      collectFeatures({
        node: each,
        names
      });
    }

    return;
  }

  const isNegation = node.kind === "not";
  if (isNegation) {
    collectFeatures({
      node: node.node,
      names
    });
    return;
  }

  const isFeature = node.kind === "boolean" || node.kind === "test";
  if (isFeature) {
    names.add(node.feature);
  }
}

/** The changes that can flip the list's answer: what a watcher has to listen to. */
export function changesOf(parsed: ParsedMedia) {
  const names = new Set<string>();
  for (const node of parsed.queries) {
    collectFeatures({
      node,
      names
    });
  }

  const changes = new Set<MediaChange>();
  for (const name of names) {
    for (const change of MEDIA_FEATURES.get(name)?.changes ?? []) {
      changes.add(change);
    }
  }

  return changes;
}

/** The media text of a list, normalised (the key a cache and `MediaQueryList.media` use). */
export function normalizedMedia(text: string) {
  return splitCommas(text).map(query => query.trim().replaceAll(/\s+/gu, " ").toLowerCase()).join(", ");
}
