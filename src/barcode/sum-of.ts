/** The sum of `values`. */
export function sumOf(values: readonly number[]) {
  let sum = 0;
  for (const value of values) {
    sum += value;
  }
  return sum;
}
