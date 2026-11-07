import { TASK_FOLDER } from "./backend.ts";
import type { TaskBackend } from "./backend.ts";
import { createSchtasksBackend } from "./native.ts";
import { parseTrigger } from "./trigger.ts";
import type { ScheduleTrigger } from "./trigger.ts";
import { taskXml } from "./xml.ts";
import { currentProgramCommand } from "#src/app/activation/command.js";
import type { ProgramCommand } from "#src/app/activation/command.js";
import { requireIdentifier } from "#src/app/activation/scheme.js";

/** What the scheduled-launch functions take besides their own arguments. */
export interface ScheduleOptions {
  /** Stands in for Task Scheduler; the tests give one. */
  readonly backend?: TaskBackend;
}

/** What `scheduleLaunch` takes. */
export interface ScheduleLaunchOptions extends ScheduleOptions {
  /** A name for the task (letters, digits, `.`, `_`, `-`); scheduling it again replaces it. */
  readonly id: string;

  /** When the app starts. */
  readonly trigger: ScheduleTrigger;

  /** The command line arguments the started copy gets (after the entry script); none by default. */
  readonly arguments?: readonly string[];

  /** What Windows starts: this process's Node and entry script by default; a bundled executable passes its own path. */
  readonly command?: ProgramCommand;
}

function taskNameOf(id: string) {
  return `${TASK_FOLDER}${requireIdentifier(id)}`;
}

/**
 * Starts the app on a schedule through Task Scheduler (`schtasks /Create
 * /XML`), as the signed-in user and with their normal rights, so it needs no
 * administrator. The task lives in the `winui-svelte` folder of Task
 * Scheduler and outlives the app until `unscheduleLaunch` removes it. The
 * started copy gets `arguments` after the entry script, and a start missed
 * while the PC was off is made up when it is next on.
 *
 * @param options - The task's id, the trigger, the arguments, and the command
 *   and backend for a bundled app or a test.
 * @throws {TypeError} When the id is not an identifier.
 * @throws {Error} When the trigger is invalid, an argument holds a control
 *   character, or Task Scheduler refuses the task.
 */
export function scheduleLaunch(options: ScheduleLaunchOptions) {
  const trigger = parseTrigger(options.trigger);
  const name = taskNameOf(options.id);
  const backend = options.backend ?? createSchtasksBackend();
  const xml = taskXml({
    trigger,
    command: options.command ?? currentProgramCommand(),
    extra: options.arguments ?? [],
    userId: backend.userId()
  });
  backend.create({
    name,
    xml
  });
}

/**
 * The ids of the scheduled launches this package made.
 *
 * @param options - The backend, for a test.
 * @returns The ids, as they were given to `scheduleLaunch`.
 */
export function listScheduledLaunches(options: ScheduleOptions = {}) {
  const backend = options.backend ?? createSchtasksBackend();
  return backend.list().map(name => name.slice(TASK_FOLDER.length));
}

/**
 * Removes a scheduled launch made by `scheduleLaunch`; a task of another
 * folder cannot be named.
 *
 * @param options - The id, and the backend for a test.
 * @returns Whether there was a task to remove.
 * @throws {TypeError} When the id is not an identifier.
 */
export function unscheduleLaunch(options: ScheduleOptions & { id: string }) {
  const name = taskNameOf(options.id);
  const backend = options.backend ?? createSchtasksBackend();
  return backend.remove(name);
}
