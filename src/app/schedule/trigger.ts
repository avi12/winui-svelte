import { z } from "zod";

const MAX_LOGON_DELAY_SECONDS = 86_400;
const MAX_INTERVAL_MINUTES = 1440;
const MAX_DAYS_BETWEEN_RUNS = 365;
const TIME_OF_DAY_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/u;

/** The kinds of trigger a scheduled launch can have. */
export const TriggerKind = {
  logon: "logon",
  daily: "daily",
  interval: "interval",
  once: "once"
} as const;

/** One kind of trigger. */
export type TriggerKind = typeof TriggerKind[keyof typeof TriggerKind];

const triggerSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal(TriggerKind.logon),
    delaySeconds: z.number().int().min(0).max(MAX_LOGON_DELAY_SECONDS).optional()
  }).strict(),
  z.object({
    kind: z.literal(TriggerKind.daily),
    at: z.string().regex(TIME_OF_DAY_PATTERN),
    everyDays: z.number().int().min(1).max(MAX_DAYS_BETWEEN_RUNS).optional()
  }).strict(),
  z.object({
    kind: z.literal(TriggerKind.interval),
    everyMinutes: z.number().int().min(1).max(MAX_INTERVAL_MINUTES)
  }).strict(),
  z.object({
    kind: z.literal(TriggerKind.once),
    at: z.date().refine(date => !Number.isNaN(date.getTime()))
  }).strict()
]);

/**
 * When a scheduled launch runs: at sign-in (optionally after a delay in
 * seconds), every day or every few days at a local time of day (`"09:30"`),
 * every so many minutes, or once at a date.
 */
export type ScheduleTrigger = z.input<typeof triggerSchema>;

/**
 * Checks a trigger that came from outside the type system.
 *
 * @param value - The trigger.
 * @returns The trigger, validated.
 * @throws {Error} When it is not one of the four kinds or a field is out of range.
 */
export function parseTrigger(value: unknown) {
  const result = triggerSchema.safeParse(value);
  if (!result.success) {
    throw new Error(`not a valid schedule trigger: ${result.error.message}`);
  }

  return result.data;
}
