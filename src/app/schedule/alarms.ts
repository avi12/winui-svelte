import type { Alarm } from "./alarm.ts";
import { TASK_FOLDER } from "./backend.ts";
import type { TaskBackend } from "./backend.ts";
import { createSchtasksBackend } from "./native.ts";
import { nextOccurrence } from "./occurrence.ts";
import { alarmTaskXml } from "./xml.ts";
import { currentProgramCommand } from "#src/app/activation/command.js";
import type { ProgramCommand } from "#src/app/activation/command.js";
import { requireIdentifier } from "#src/app/activation/scheme.js";
import { z } from "zod";

const MS_PER_MINUTE = 60_000;
const MIN_PERIOD_MINUTES = 1;
const MAX_PERIOD_MINUTES = 44_640;
const DESCRIPTION_PATTERN = /<Description>([\s\S]*?)<\/Description>/u;
const XML_ENTITIES = new Map([
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", "\""],
  ["&apos;", "'"]
]);
const XML_ENTITY = /&(?:amp|lt|gt|quot|apos);/gu;

const createInfoSchema = z.object({
  when: z.number().finite().positive().optional(),
  delayInMinutes: z.number().finite().min(0).optional(),
  periodInMinutes: z.number().finite().min(MIN_PERIOD_MINUTES).max(MAX_PERIOD_MINUTES).optional(),
  arguments: z.array(z.string()).optional(),
  runWhenOnBattery: z.boolean().optional()
}).loose().superRefine((info, context) => {
  const hasTime = info.when !== undefined || info.delayInMinutes !== undefined || info.periodInMinutes !== undefined;
  if (!hasTime) {
    context.addIssue({
      code: "custom",
      message: "give when, delayInMinutes or periodInMinutes"
    });
  }

  const hasBoth = info.when !== undefined && info.delayInMinutes !== undefined;
  if (hasBoth) {
    context.addIssue({
      code: "custom",
      message: "when and delayInMinutes cannot both be set"
    });
  }
});

const storedSchema = z.object({
  firstTime: z.number().finite(),
  periodInMinutes: z.number().finite().positive().optional()
}).strict();

/** What the alarm functions take besides the alarm's own fields. */
export interface AlarmOptions {
  /** Stands in for Task Scheduler; the tests give one. */
  readonly backend?: TaskBackend;
}

/** What `create` takes: `chrome.alarms.AlarmCreateInfo`, plus a few extras. */
export interface AlarmCreateInfo extends AlarmOptions {
  /** When the alarm goes off, in milliseconds since 1970; not with `delayInMinutes`. */
  readonly when?: number;

  /** Minutes from now until it goes off; the period when only `periodInMinutes` is given. */
  readonly delayInMinutes?: number;

  /** Minutes between repeats, from 1; the alarm goes off once when absent. */
  readonly periodInMinutes?: number;

  /** The command line arguments the started copy gets, after the entry script and the alarm marker; none by default. */
  readonly arguments?: readonly string[];

  /** Whether the alarm may start the app on battery power; true by default. */
  readonly runWhenOnBattery?: boolean;

  /** What Windows starts: this process's Node and entry script by default; a bundled executable passes its own path. */
  readonly command?: ProgramCommand;
}

function taskNameOf(name: string) {
  return `${TASK_FOLDER}${requireIdentifier(name)}`;
}

function unescapeXml(text: string) {
  return text.replace(XML_ENTITY, entity => XML_ENTITIES.get(entity) ?? entity);
}

function storedOf(xml: string) {
  const text = DESCRIPTION_PATTERN.exec(xml)?.[1];
  const isMissing = text === undefined;
  if (isMissing) {
    return undefined;
  }

  try {
    const result = storedSchema.safeParse(JSON.parse(unescapeXml(text)));
    return result.success ? result.data : undefined;
  } catch {
    return undefined;
  }
}

function alarmOf({ name, xml }: {
  name: string;
  xml: string;
}) {
  const stored = storedOf(xml);
  const isUnreadable = stored === undefined;
  if (isUnreadable) {
    return undefined;
  }

  return {
    name,
    scheduledTime: nextOccurrence({
      firstTime: stored.firstTime,
      periodInMinutes: stored.periodInMinutes,
      now: Date.now()
    }),
    ...stored.periodInMinutes === undefined ? {} : { periodInMinutes: stored.periodInMinutes }
  } satisfies Alarm;
}

/**
 * Creates an alarm, as `chrome.alarms.create` does; one of the same name is
 * replaced. A Task Scheduler task in the `winui-svelte` folder relaunches the
 * app (`schtasks /Create /XML`, as the signed-in user with normal rights)
 * with an alarm marker argument; `startActivation` turns that into `onAlarm`
 * in the copy that is running, or in the one the task starts when the app was
 * closed. Chrome's one-minute minimum for `delayInMinutes` is not applied; a
 * repeat cannot be shorter than Task Scheduler's minute.
 *
 * @param name - The alarm's name (letters, digits, `.`, `_`, `-`).
 * @param info - When it goes off, how often it repeats, and the extras.
 * @returns A promise that settles when the task is registered.
 * @throws {TypeError} When the name is not an identifier.
 * @throws {Error} When the fields are not valid, an argument holds a control
 *   character, or Task Scheduler refuses the task.
 */
// eslint-disable-next-line no-restricted-syntax -- mirrors chrome.alarms.create(name, info)
export async function create(name: string, info: AlarmCreateInfo = {}) {
  const taskName = taskNameOf(name);
  const parsed = createInfoSchema.safeParse(info);
  if (!parsed.success) {
    throw new Error(`not a valid alarm: ${parsed.error.message}`);
  }

  const { when, delayInMinutes, periodInMinutes } = info;
  const delay = delayInMinutes ?? periodInMinutes ?? 0;
  const firstTime = when ?? Date.now() + delay * MS_PER_MINUTE;
  const backend = info.backend ?? createSchtasksBackend();
  backend.create({
    name: taskName,
    xml: alarmTaskXml({
      alarm: {
        name,
        firstTime,
        periodInMinutes
      },
      command: info.command ?? currentProgramCommand(),
      extra: info.arguments ?? [],
      isBatteryAllowed: info.runWhenOnBattery ?? true,
      description: JSON.stringify({
        firstTime,
        ...periodInMinutes === undefined ? {} : { periodInMinutes }
      }),
      userId: backend.userId()
    })
  });
}

/**
 * Reads an alarm, as `chrome.alarms.get` does.
 *
 * @param name - The alarm's name.
 * @param options - The backend, for a test.
 * @returns The alarm, or undefined when there is none.
 * @throws {TypeError} When the name is not an identifier.
 */
// eslint-disable-next-line no-restricted-syntax -- mirrors chrome.alarms.get(name)
export async function get(name: string, options: AlarmOptions = {}) {
  const taskName = taskNameOf(name);
  const xml = (options.backend ?? createSchtasksBackend()).read(taskName);
  return xml === undefined ? undefined : alarmOf({
    name,
    xml
  });
}

/**
 * Reads every alarm this package made, as `chrome.alarms.getAll` does.
 *
 * @param options - The backend, for a test.
 * @returns The alarms.
 */
export async function getAll(options: AlarmOptions = {}) {
  const backend = options.backend ?? createSchtasksBackend();
  const alarms: Alarm[] = [];
  for (const taskName of backend.list()) {
    const xml = backend.read(taskName);
    const alarm = xml === undefined ? undefined : alarmOf({
      name: taskName.slice(TASK_FOLDER.length),
      xml
    });
    const isAlarm = alarm !== undefined;
    if (isAlarm) {
      alarms.push(alarm);
    }
  }

  return alarms;
}

/**
 * Removes an alarm, as `chrome.alarms.clear` does; a task of another folder
 * cannot be named.
 *
 * @param name - The alarm's name.
 * @param options - The backend, for a test.
 * @returns Whether there was an alarm to remove.
 * @throws {TypeError} When the name is not an identifier.
 */
// eslint-disable-next-line no-restricted-syntax -- mirrors chrome.alarms.clear(name)
export async function clear(name: string, options: AlarmOptions = {}) {
  const taskName = taskNameOf(name);
  return (options.backend ?? createSchtasksBackend()).remove(taskName);
}

/**
 * Removes every alarm this package made, as `chrome.alarms.clearAll` does.
 *
 * @param options - The backend, for a test.
 * @returns Whether there was any alarm to remove.
 */
export async function clearAll(options: AlarmOptions = {}) {
  const backend = options.backend ?? createSchtasksBackend();
  const removed = backend.list().map(taskName => backend.remove(taskName));
  return removed.some(Boolean);
}
