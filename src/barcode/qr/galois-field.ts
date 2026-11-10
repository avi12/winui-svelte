const FIELD_SIZE = 256;
const FIELD_ORDER = 255;
const PRIMITIVE_POLYNOMIAL = 0x11d;

interface FieldTables {
  readonly exp: Uint8Array;
  readonly log: Uint8Array;
}

let cachedTables: FieldTables | undefined;

function fieldTables() {
  if (cachedTables) {
    return cachedTables;
  }

  const exp = new Uint8Array(FIELD_ORDER * 2);
  const log = new Uint8Array(FIELD_SIZE);
  let value = 1;
  for (let power = 0; power < FIELD_ORDER; power++) {
    exp[power] = value;
    exp[power + FIELD_ORDER] = value;
    log[value] = power;
    value *= 2;
    const hasOverflowed = value >= FIELD_SIZE;
    if (hasOverflowed) {
      value ^= PRIMITIVE_POLYNOMIAL;
    }
  }
  cachedTables = {
    exp,
    log
  };
  return cachedTables;
}

/** The power `exponent` of the field's generator (alpha), for any integer. */
export function alphaPower(exponent: number) {
  const wrapped = ((exponent % FIELD_ORDER) + FIELD_ORDER) % FIELD_ORDER;
  return fieldTables().exp[wrapped] ?? 0;
}

/** The product of two elements of GF(256) with the QR polynomial 0x11D. */
export function multiply({ left, right }: {
  readonly left: number;
  readonly right: number;
}) {
  const isZero = left === 0 || right === 0;
  if (isZero) {
    return 0;
  }

  const { exp, log } = fieldTables();
  return exp[(log[left] ?? 0) + (log[right] ?? 0)] ?? 0;
}

/** `dividend` over a nonzero `divisor` in GF(256). */
export function divide({ dividend, divisor }: {
  readonly dividend: number;
  readonly divisor: number;
}) {
  const isZero = dividend === 0;
  if (isZero) {
    return 0;
  }

  const { exp, log } = fieldTables();
  return exp[(log[dividend] ?? 0) + FIELD_ORDER - (log[divisor] ?? 0)] ?? 0;
}
