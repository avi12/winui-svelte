import { matchingParenthesis, splitCommas } from "./split.ts";

// `calc()` over lengths and numbers, folded to one value at build time. A
// term in % or a custom property needs the parent's size or a runtime lookup,
// which a Style cannot hold, so the whole expression is null.

const CLAMP_ARGUMENTS = 3;
const MATH_START = /(?<![\w-])(min|max|clamp)\(/giu;
const HAS_MATH = /(?<![\w-])(min|max|clamp)\(/iu;
const LENGTH_TOKEN = /^(-?(?:\d+\.?\d*|\.\d+))(px)?$/iu;
const CALC = /^calc\((.*)\)$/isu;
const TOKEN = /\s*([()+*/]|-(?=\s)|-?[^\s()+*/-][^\s()+*/]*)/gy;
const PRECEDENCE = new Map([["+", 1], ["-", 1], ["*", 2], ["/", 2]]);

/** A value while folding: a length in px, or a plain number. */
interface Quantity {
  value: number;
  isLength: boolean;
}

function tokenize(text: string) {
  const tokens = [...text.matchAll(TOKEN)].map(match => match[1] ?? "");
  const rebuilt = tokens.join("");
  return rebuilt === text.replaceAll(/\s+/gu, "") ? tokens : null;
}

function operand(token: string) {
  const match = LENGTH_TOKEN.exec(token);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const unit = (match[2] ?? "").toLowerCase();
  const amount = Number(match[1]);
  return {
    value: amount,
    isLength: unit !== ""
  } satisfies Quantity;
}

function apply({ operator, left, right }: {
  operator: string;
  left: Quantity;
  right: Quantity;
}) {
  const isSum = operator === "+" || operator === "-";
  if (isSum) {
    const isCompatible = left.isLength === right.isLength;
    return isCompatible ? {
      value: operator === "+" ? left.value + right.value : left.value - right.value,
      isLength: left.isLength
    } : null;
  }

  const isProduct = operator === "*";
  if (isProduct) {
    const isOneNumber = !left.isLength || !right.isLength;
    return isOneNumber ? {
      value: left.value * right.value,
      isLength: left.isLength || right.isLength
    } : null;
  }

  const isDivisible = !right.isLength && right.value !== 0;
  return isDivisible ? {
    value: left.value / right.value,
    isLength: left.isLength
  } : null;
}

function reduce({ values, operators }: Stacks) {
  const operator = operators.pop() ?? "";
  const right = values.pop() ?? null;
  const left = values.pop() ?? null;
  const isMissing = left === null || right === null;
  values.push(
    isMissing ? null : apply({
      operator,
      left,
      right
    })
  );
}

interface Stacks {
  values: Array<Quantity | null>;
  operators: string[];
}

function reduceUntilOpening(stacks: Stacks) {
  while (stacks.operators.length > 0 && stacks.operators.at(-1) !== "(") {
    reduce(stacks);
  }
}

function pushOperator({ stacks, token, precedence }: {
  stacks: Stacks;
  token: string;
  precedence: number;
}) {
  while ((PRECEDENCE.get(stacks.operators.at(-1) ?? "") ?? 0) >= precedence) {
    reduce(stacks);
  }

  stacks.operators.push(token);
}

// Shunting-yard: operators wait on a stack until one of lower precedence arrives.
function fold(tokens: readonly string[]) {
  const stacks: Stacks = {
    values: [],
    operators: []
  };
  for (const token of tokens) {
    const precedence = PRECEDENCE.get(token);
    const isOperator = precedence !== undefined;
    const isOpening = token === "(";
    const isClosing = token === ")";
    if (isClosing) {
      reduceUntilOpening(stacks);
      const isOpened = stacks.operators.pop() === "(";
      if (!isOpened) {
        return null;
      }
    } else if (isOpening) {
      stacks.operators.push(token);
    } else if (isOperator) {
      pushOperator({
        stacks,
        token,
        precedence
      });
    } else {
      stacks.values.push(operand(token));
    }
  }

  reduceUntilOpening(stacks);
  const isFolded = stacks.operators.length === 0 && stacks.values.length === 1;
  return isFolded ? stacks.values[0] ?? null : null;
}

// min(a, b), max(a, b) and clamp(low, value, high), the arguments folded to px.
function mathResult({ name, lengths }: {
  name: string;
  lengths: number[];
}) {
  const [low = 0, value = 0, high = 0] = lengths;
  const isClamp = name === "clamp";
  if (isClamp) {
    return lengths.length === CLAMP_ARGUMENTS ? Math.max(low, Math.min(value, high)) : null;
  }

  const isMin = name === "min";
  return isMin ? Math.min(...lengths) : Math.max(...lengths);
}

function foldQuantity(token: string) {
  const inner = CALC.exec(token.trim())?.[1];
  const tokens = inner === undefined ? null : tokenize(inner.trim());
  return tokens === null ? null : fold(tokens);
}

function foldCalc(token: string) {
  const result = foldQuantity(token);
  const isLength = result !== null && result.isLength;
  return isLength ? result.value : null;
}

/** The number a `calc()` of plain numbers comes to; null for anything else (a length, a %, a var()). */
export function evaluateNumberCalc(token: string) {
  const result = foldQuantity(token);
  const isNumber = result !== null && !result.isLength;
  return isNumber ? result.value : null;
}

// Replaces the innermost min(), max() or clamp() with the px it comes to; null
// when an argument does not fold. Called until none is left.
function foldInnermostMath(text: string) {
  const last = [...text.matchAll(MATH_START)].at(-1);
  const isNoneLeft = last === undefined;
  if (isNoneLeft) {
    return text;
  }

  const open = last.index + last[0].length - 1;
  const end = matchingParenthesis({
    text,
    open
  });
  const lengths = splitCommas(text.slice(open + 1, end)).map(argument => foldCalc(CALC.test(argument) ? argument : `calc(${argument})`));
  const isFoldable = end < text.length && lengths.length > 0 && lengths.every(length => length !== null);
  const folded = isFoldable ? mathResult({
    name: (last[1] ?? "").toLowerCase(),
    lengths: lengths.filter(length => length !== null)
  }) : null;
  return folded === null ? null : `${text.slice(0, last.index)}${folded}px${text.slice(end + 1)}`;
}

function foldAllMath(token: string) {
  let text = token;
  while (HAS_MATH.test(text)) {
    const next = foldInnermostMath(text);
    const isFolded = next !== null;
    if (!isFolded) {
      return null;
    }

    text = next;
  }

  return text;
}

/**
 * The pixels a `calc()`, `min()`, `max()` or `clamp()` of px lengths and
 * plain numbers comes to; null for anything else (a %, a var(), a length times
 * a length).
 */
export function evaluateCalc(token: string) {
  const text = foldAllMath(token.trim());
  const isMathFailed = text === null;
  if (isMathFailed) {
    return null;
  }

  const bare = LENGTH_TOKEN.exec(text);
  const isFoldedMath = text !== token.trim();
  const isPixels = isFoldedMath && bare !== null && (bare[2] ?? "").toLowerCase() === "px";
  return isPixels ? Number(bare[1]) : foldCalc(text);
}
