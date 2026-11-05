import { ValueKind } from "./markup-scan.ts";
import type { AttributeNode } from "./markup-scan.ts";

export type PropValue =
  | {
    kind: "text";
    text: string;
  }
  | {
    kind: "number";
    literal: string;
  }
  | {
    kind: "flag";
    isOn: boolean;
  }
  | {
    kind: "member";
    qualifier: string;
    name: string;
  }
  | {
    kind: "tuple";
    numbers: string[];
  }
  | {
    kind: "conditional";
    condition: string;
    whenTrue: PropValue;
    whenFalse: PropValue;
  };

const NUMBER = /^(?:\d+\.?\d*|\.\d+)$/u;
const MEMBER = /^([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)$/u;
const OPENERS = new Set(["(", "[", "{"]);
const CLOSERS = new Set([")", "]", "}"]);
const QUOTES = new Set(["\"", "'", "`"]);

interface Ternary {
  condition: string;
  whenTrue: string;
  whenFalse: string;
}

function isOptionalOperator({ source, i }: {
  source: string;
  i: number;
}) {
  const next = source.charAt(i + 1);
  return next === "." || next === "?";
}

function splitTernary(source: string) {
  let depth = 0;
  let quote = "";
  let question = -1;
  let nested = 0;
  for (let i = 0; i < source.length; i += 1) {
    const char = source.charAt(i);
    const isInQuote = quote !== "";
    if (isInQuote) {
      quote = char === quote ? "" : quote;
      continue;
    }

    quote = QUOTES.has(char) ? char : "";
    depth += OPENERS.has(char) ? 1 : 0;
    depth -= CLOSERS.has(char) ? 1 : 0;
    const isTopLevel = depth === 0;
    const isQuestion = char === "?" && !isOptionalOperator({
      source,
      i
    });
    const isTopLevelQuestion = isTopLevel && isQuestion;
    if (isTopLevelQuestion) {
      const isFirst = question === -1;
      question = isFirst ? i : question;
      nested += isFirst ? 0 : 1;
      continue;
    }

    const isMatchingColon = isTopLevel && char === ":" && question !== -1;
    const isOwnColon = isMatchingColon && nested === 0;
    if (isOwnColon) {
      return {
        condition: source.slice(0, question).trim(),
        whenTrue: source.slice(question + 1, i).trim(),
        whenFalse: source.slice(i + 1).trim()
      } satisfies Ternary;
    }

    nested -= isMatchingColon ? 1 : 0;
  }

  return undefined;
}

function isWrappedInParentheses(source: string) {
  const isWrapped = source.startsWith("(") && source.endsWith(")");
  if (!isWrapped) {
    return false;
  }

  let depth = 0;
  for (let i = 0; i < source.length - 1; i += 1) {
    depth += source.charAt(i) === "(" ? 1 : 0;
    depth -= source.charAt(i) === ")" ? 1 : 0;
    const isClosedEarly = depth === 0;
    if (isClosedEarly) {
      return false;
    }
  }

  return true;
}

function stripParentheses(source: string) {
  let current = source;
  while (isWrappedInParentheses(current)) {
    current = current.slice(1, -1).trim();
  }

  return current;
}

function readLiteral(source: string) {
  if (NUMBER.test(source)) {
    return {
      kind: "number",
      literal: source
    };
  }

  const isNegative = source.startsWith("-") && NUMBER.test(source.slice(1).trim());
  if (isNegative) {
    return {
      kind: "number",
      literal: `-${source.slice(1).trim()}`
    };
  }

  const isFlag = source === "true" || source === "false";
  if (isFlag) {
    return {
      kind: "flag",
      isOn: source === "true"
    };
  }

  const first = source.charAt(0);
  const isString = (first === "\"" || first === "'") && source.length >= 2 && source.endsWith(first);
  const inner = source.slice(1, -1);
  const isPlain = !inner.includes(first) && !inner.includes("\\");
  const isPlainString = isString && isPlain;
  return isPlainString ? {
    kind: "text",
    text: inner
  } : undefined;
}

function readTuple(source: string) {
  const isArray = source.startsWith("[") && source.endsWith("]");
  if (!isArray) {
    return undefined;
  }

  const parts = source.slice(1, -1).split(",").map(part => readExpression(part.trim()));
  const numbers = parts.flatMap(part => part?.kind === "number" ? [part.literal] : []);
  const isNumeric = numbers.length > 0 && numbers.length === parts.length;
  return isNumeric ? {
    kind: "tuple",
    numbers
  } : undefined;
}

// A function that calls itself needs its return type written: TypeScript cannot infer one that refers to itself
function readExpression(expression: string): PropValue | undefined;
function readExpression(expression: string) {
  const source = stripParentheses(expression.trim());
  const ternary = splitTernary(source);
  const hasTernary = ternary !== undefined;
  if (hasTernary) {
    const whenTrue = readExpression(ternary.whenTrue);
    const whenFalse = readExpression(ternary.whenFalse);
    const isComplete = whenTrue !== undefined && whenFalse !== undefined && ternary.condition !== "";
    return isComplete ? {
      kind: "conditional",
      condition: ternary.condition,
      whenTrue,
      whenFalse
    } : undefined;
  }

  const member = MEMBER.exec(source);
  const hasMember = member !== null;
  if (hasMember) {
    return {
      kind: "member",
      qualifier: member[1] ?? "",
      name: member[2] ?? ""
    };
  }

  return readLiteral(source) ?? readTuple(source);
}

/**
 * What an attribute says, when it says something a CSS value can: a literal, an enum member, a flag, a list of
 * numbers or a condition choosing between those. A computed value is undefined.
 */
export function readAttribute(attribute: AttributeNode) {
  const { value } = attribute;
  const hasNoValue = value === undefined;
  if (hasNoValue) {
    return {
      kind: "flag",
      isOn: true
    } satisfies PropValue;
  }

  const isExpression = value.kind === ValueKind.EXPRESSION;
  if (isExpression) {
    return readExpression(value.text.slice(1, -1));
  }

  const text = value.kind === ValueKind.QUOTED ? value.text.slice(1, -1) : value.text;
  const isStatic = !text.includes("{");
  return isStatic ? {
    kind: "text",
    text
  } satisfies PropValue : undefined;
}
