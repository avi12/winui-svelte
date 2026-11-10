import { alphaPower, divide, multiply } from "./galois-field.ts";

function syndromesOf({ codewords, parityCount }: {
  readonly codewords: Uint8Array;
  readonly parityCount: number;
}) {
  const syndromes: number[] = [];
  for (let power = 0; power < parityCount; power++) {
    const root = alphaPower(power);
    let accumulator = 0;
    for (const codeword of codewords) {
      accumulator = multiply({
        left: accumulator,
        right: root
      }) ^ codeword;
    }
    syndromes.push(accumulator);
  }
  return syndromes;
}

function addShifted({ base, addend, scale, shift }: {
  readonly base: readonly number[];
  readonly addend: readonly number[];
  readonly scale: number;
  readonly shift: number;
}) {
  const result = Array.from({ length: Math.max(base.length, addend.length + shift) }, (_, i) => base[i] ?? 0);
  for (let i = 0; i < addend.length; i++) {
    result[i + shift] = (result[i + shift] ?? 0) ^ multiply({
      left: scale,
      right: addend[i] ?? 0
    });
  }
  return result;
}

// Berlekamp-Massey: the error locator polynomial, lowest degree first.
function errorLocator(syndromes: readonly number[]) {
  let locator = [1];
  let previous = [1];
  let length = 0;
  let shift = 1;
  let previousDiscrepancy = 1;
  for (let step = 0; step < syndromes.length; step++) {
    let discrepancy = syndromes[step] ?? 0;
    for (let i = 1; i <= length; i++) {
      discrepancy ^= multiply({
        left: locator[i] ?? 0,
        right: syndromes[step - i] ?? 0
      });
    }
    const isConsistent = discrepancy === 0;
    if (isConsistent) {
      shift++;
      continue;
    }

    const scale = divide({
      dividend: discrepancy,
      divisor: previousDiscrepancy
    });
    const next = addShifted({
      base: locator,
      addend: previous,
      scale,
      shift
    });
    const isLengthChange = 2 * length <= step;
    if (isLengthChange) {
      previous = locator;
      length = step + 1 - length;
      previousDiscrepancy = discrepancy;
      shift = 1;
    } else {
      shift++;
    }

    locator = next;
  }
  return locator.slice(0, length + 1);
}

function evaluate({ polynomial, point }: {
  readonly polynomial: readonly number[];
  readonly point: number;
}) {
  let result = 0;
  for (let i = polynomial.length - 1; i >= 0; i--) {
    result = multiply({
      left: result,
      right: point
    }) ^ (polynomial[i] ?? 0);
  }
  return result;
}

// The derivative in characteristic 2 keeps the odd-degree terms.
function derivative(polynomial: readonly number[]) {
  return polynomial.slice(1).map((coefficient, i) => i % 2 === 0 ? coefficient : 0);
}

function errorEvaluator({ syndromes, locator }: {
  readonly syndromes: readonly number[];
  readonly locator: readonly number[];
}) {
  const evaluator: number[] = [];
  for (let i = 0; i < syndromes.length; i++) {
    let coefficient = 0;
    for (let j = 0; j <= i; j++) {
      coefficient ^= multiply({
        left: syndromes[j] ?? 0,
        right: locator[i - j] ?? 0
      });
    }
    evaluator.push(coefficient);
  }
  return evaluator;
}

/**
 * Repairs a Reed-Solomon codeword block (data, then parity) over GF(256) with
 * the QR code's generator roots alpha^0 to alpha^(parityCount - 1).
 * Returns the block with its errors fixed, or `undefined` when there are more
 * errors than `parityCount / 2`.
 */
export function correctErrors({ codewords, parityCount }: {
  readonly codewords: Uint8Array;
  readonly parityCount: number;
}) {
  const received = Uint8Array.from(codewords);
  const syndromes = syndromesOf({
    codewords: received,
    parityCount
  });
  const isClean = syndromes.every(syndrome => syndrome === 0);
  if (isClean) {
    return received;
  }

  const locator = errorLocator(syndromes);
  const errorCount = locator.length - 1;
  const isBeyondCapacity = errorCount * 2 > parityCount;
  if (isBeyondCapacity) {
    return undefined;
  }

  const evaluator = errorEvaluator({
    syndromes,
    locator
  });
  const slope = derivative(locator);
  let foundCount = 0;
  for (let degree = 0; degree < received.length; degree++) {
    const inverse = alphaPower(-degree);
    const isRoot = evaluate({
      polynomial: locator,
      point: inverse
    }) === 0;
    if (!isRoot) {
      continue;
    }

    foundCount++;
    const denominator = evaluate({
      polynomial: slope,
      point: inverse
    });
    const numerator = multiply({
      left: alphaPower(degree),
      right: evaluate({
        polynomial: evaluator,
        point: inverse
      })
    });
    const isSingular = denominator === 0;
    if (isSingular) {
      return undefined;
    }

    const iCodeword = received.length - 1 - degree;
    received[iCodeword] = (received[iCodeword] ?? 0) ^ divide({
      dividend: numerator,
      divisor: denominator
    });
  }
  const isLocated = foundCount === errorCount;
  const isRepaired = isLocated && syndromesOf({
    codewords: received,
    parityCount
  }).every(syndrome => syndrome === 0);
  return isRepaired ? received : undefined;
}
