const MAXIMUM_AVERAGE_ERROR = 0.48;
const MAXIMUM_SINGLE_ERROR = 0.75;
const MINIMUM_UNIT = 0.7;

/**
 * Which of `patterns` (strings of element widths in modules, such as "3211")
 * the measured pixel `widths` match best, as an index, or -1 when none is close
 * enough. The unit is taken from the widths themselves, so the match does not
 * depend on the scale.
 */
export function matchPattern({ widths, patterns }: {
  readonly widths: readonly number[];
  readonly patterns: readonly string[];
}) {
  let total = 0;
  for (const width of widths) {
    total += width;
  }
  let best = -1;
  let bestError = MAXIMUM_AVERAGE_ERROR;
  for (const [iPattern, pattern] of patterns.entries()) {
    let patternTotal = 0;
    for (const character of pattern) {
      patternTotal += Number(character);
    }
    const unit = total / patternTotal;
    const isTooSmall = unit < MINIMUM_UNIT;
    if (isTooSmall) {
      continue;
    }

    let errorSum = 0;
    let worst = 0;
    for (const [i, width] of widths.entries()) {
      const error = Math.abs(width - Number(pattern.charAt(i)) * unit) / unit;
      errorSum += error;
      worst = Math.max(worst, error);
    }
    const average = errorSum / widths.length;
    const isBetter = average < bestError && worst <= MAXIMUM_SINGLE_ERROR;
    if (isBetter) {
      best = iPattern;
      bestError = average;
    }
  }
  return best;
}
