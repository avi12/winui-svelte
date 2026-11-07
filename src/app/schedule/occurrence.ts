const MS_PER_MINUTE = 60_000;

/**
 * The first moment of an alarm at or after `now`: its first time, or the next
 * of its repeats.
 *
 * @param options - The first time and the period (none for a one-shot alarm)
 *   and the moment to count from, all in milliseconds since 1970 except the
 *   period, in minutes.
 * @returns The time, in milliseconds since 1970.
 */
export function nextOccurrence({ firstTime, periodInMinutes, now }: {
  firstTime: number;
  periodInMinutes: number | undefined;
  now: number;
}) {
  const isFirst = firstTime >= now || periodInMinutes === undefined;
  if (isFirst) {
    return firstTime;
  }

  const period = periodInMinutes * MS_PER_MINUTE;
  return firstTime + Math.ceil((now - firstTime) / period) * period;
}

/**
 * The last moment of an alarm at or before `now`: the repeat that is running,
 * or the first time.
 *
 * @param options - As for `nextOccurrence`.
 * @returns The time, in milliseconds since 1970.
 */
export function latestOccurrence({ firstTime, periodInMinutes, now }: {
  firstTime: number;
  periodInMinutes: number | undefined;
  now: number;
}) {
  const isFirst = now <= firstTime || periodInMinutes === undefined;
  if (isFirst) {
    return firstTime;
  }

  const period = periodInMinutes * MS_PER_MINUTE;
  return firstTime + Math.floor((now - firstTime) / period) * period;
}
