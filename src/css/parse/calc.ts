// `calc()` over lengths and numbers, folded to one value at build time. A
// term in % or a custom property needs the parent's size or a runtime lookup,
// which a Style cannot hold, so the whole expression is null.

const LENGTH_TOKEN = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem)?$/iu;
const PIXELS_PER_REM = 16;
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
    value: unit === "rem" ? amount * PIXELS_PER_REM : amount,
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

/**
 * The pixels a `calc()` of px and rem lengths and plain numbers comes to; null
 * for anything else (a %, a var(), a length times a length).
 */
export function evaluateCalc(token: string) {
  const inner = CALC.exec(token.trim())?.[1];
  const tokens = inner === undefined ? null : tokenize(inner.trim());
  const result = tokens === null ? null : fold(tokens);
  const isLength = result !== null && result.isLength;
  return isLength ? result.value : null;
}
