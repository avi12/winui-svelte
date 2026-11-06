const WINDOWS_EPOCH_OFFSET_MILLISECONDS = 11_644_473_600_000;
const TICKS_PER_MILLISECOND = 10_000;

/**
 * A moment as a WinRT `DateTime`: 100-nanosecond ticks since 1601.
 *
 * @param milliseconds - Milliseconds since 1970, as `Date.now()` counts.
 * @returns The `DateTime` struct.
 */
export function ticksOf(milliseconds: number) {
  const milliseconds1601 = Math.round(milliseconds + WINDOWS_EPOCH_OFFSET_MILLISECONDS);
  return { universalTime: BigInt(milliseconds1601) * BigInt(TICKS_PER_MILLISECOND) };
}
