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

function reduce({ values, operators }: {
  values: Array<Quantity | null>;
  operators: string[];
}) {
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

// Shunting-yard: operators wait on a stack until one of lower precedence arrives.
function fold(tokens: readonly string[]) {
  const values: Array<Quantity | null> = [];
  const operators: string[] = [];
  for (const token of tokens) {
    const precedence = PRECEDENCE.get(token);
    const isOperator = precedence !== undefined;
    const isOpening = token === "(";
    if (isOpening) {
      operators.push(token);
    } else if (token === ")") {
      while (operators.length > 0 && operators.at(-1) !== "(") {
        reduce({
          values,
          operators
        });
      }

      const isOpened = operators.pop() === "(";
      if (!isOpened) {
        return null;
      }
    } else if (isOperator) {
      while ((PRECEDENCE.get(operators.at(-1) ?? "") ?? 0) >= precedence) {
        reduce({
          values,
          operators
        });
      }

      operators.push(token);
    } else {
      values.push(operand(token));
    }
  }

  while (operators.length > 0 && operators.at(-1) !== "(") {
    reduce({
      values,
      operators
    });
  }

  const isFolded = operators.length === 0 && values.length === 1;
  return isFolded ? values[0] ?? null : null;
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
