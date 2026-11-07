/** A scheduled alarm, as `chrome.alarms.Alarm` has it. */
export interface Alarm {
  /** The name the alarm was created with. */
  readonly name: string;

  /** When it goes off next (or just went off, in `onAlarm`), in milliseconds since 1970. */
  readonly scheduledTime: number;

  /** The minutes between repeats; absent for an alarm that goes off once. */
  readonly periodInMinutes?: number;
}
