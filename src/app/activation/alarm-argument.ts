import { isIdentifier } from "./scheme.ts";

const ALARM_PREFIX = "--winui-svelte-alarm=";
const FIELD_SEPARATOR = ":";
const FIELD_COUNT = 3;

/** What an alarm's task tells the started copy: the name and when the schedule began and repeats. */
export interface AlarmMarker {
  readonly name: string;
  readonly firstTime: number;
  readonly periodInMinutes?: number;
}

/**
 * The argument an alarm's task puts first on its command line.
 *
 * @param marker - The alarm's name, first time and period.
 * @returns The argument.
 */
export function alarmArgument({ name, firstTime, periodInMinutes }: AlarmMarker) {
  return `${ALARM_PREFIX}${[name, firstTime, periodInMinutes ?? ""].join(FIELD_SEPARATOR)}`;
}

function markerOf(value: string) {
  const fields = value.slice(ALARM_PREFIX.length).split(FIELD_SEPARATOR);
  const [name = "", first = "", period = ""] = fields;
  const firstTime = Number(first);
  const periodInMinutes = period === "" ? undefined : Number(period);
  const isPeriodValid = periodInMinutes === undefined || periodInMinutes > 0 && Number.isFinite(periodInMinutes);
  const isValid = fields.length === FIELD_COUNT && isIdentifier(name) && first !== "" && Number.isFinite(firstTime) && isPeriodValid;
  if (!isValid) {
    return undefined;
  }

  return {
    name,
    firstTime,
    ...periodInMinutes === undefined ? {} : { periodInMinutes }
  } satisfies AlarmMarker;
}

/**
 * Splits the alarm marker off an activation's arguments.
 *
 * @param values - The arguments.
 * @returns The marker (undefined when no alarm started this) and the other arguments.
 */
export function splitAlarmArgument(values: readonly string[]) {
  const argument = values.find(value => value.startsWith(ALARM_PREFIX));
  const marker = argument === undefined ? undefined : markerOf(argument);
  return {
    marker,
    rest: marker === undefined ? values : values.filter(value => value !== argument)
  };
}
