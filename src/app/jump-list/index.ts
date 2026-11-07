import { createJumpListNative } from "./native.ts";
import { commandOrCurrent, resolveAppUserModelId, shellLinksOf } from "./tasks.ts";
import type { JumpListBackend, JumpListTask } from "./tasks.ts";
import type { ProgramCommand } from "#src/app/activation/command.js";
import { ActivationKind } from "#src/app/activation/kinds.js";
import type { ActivationEvent } from "#src/app/activation/kinds.js";

export type { JumpListBackend, JumpListTask, ShellLinkSpec } from "./tasks.ts";

/** What `setJumpListTasks` takes. */
export interface JumpListOptions<Tasks extends readonly JumpListTask[]> {
  /**
   * The AppUserModelID the list belongs to; the process's own when omitted. It
   * must equal the one the windows have (`appUserModelId` of `<Window>`).
   */
  readonly appUserModelId?: string;

  /** The entries, in the order shown. Keep them static: Microsoft advises against changing Tasks while the app runs. */
  readonly tasks: Tasks;

  /**
   * What Windows starts for a task: this process's Node and entry script by
   * default; a bundled executable passes its own.
   */
  readonly command?: ProgramCommand;

  /** Stands in for the shell; the tests give one. */
  readonly backend?: JumpListBackend;
}

/** The ids of a list of tasks, as a union. */
export type JumpListTaskId<Tasks extends readonly JumpListTask[]> = Tasks[number]["id"];

/** A list that was set. */
export interface JumpList<Tasks extends readonly JumpListTask[]> {
  /** The tasks as they were given, with their ids as literal types. */
  readonly tasks: Tasks;

  /**
   * The task an activation came from.
   *
   * @param event - What `startActivation` delivered.
   * @returns The task, or undefined when a task of this list did not start it.
   */
  taskOf(event: ActivationEvent): Tasks[number] | undefined;
}

/**
 * Puts tasks in the Tasks section of the taskbar button's right-click menu.
 * Choosing one starts the app with the task's `arguments`, which the single
 * instance redirect hands to the running copy as a `jumpList` activation.
 * Needs no package identity; call it on a thread with COM, once the windows'
 * AppUserModelID is set.
 *
 * @param options - The tasks and, optionally, the id and the start command.
 * @returns The list, to match an activation back to its task.
 * @throws {TypeError} For an invalid or repeated id, an empty title or an icon that is not a file path.
 * @throws {Error} When the AppUserModelID is not set or differs from `appUserModelId`.
 */
export function setJumpListTasks<const Tasks extends readonly JumpListTask[]>(options: JumpListOptions<Tasks>) {
  const { tasks, backend = createJumpListNative() } = options;
  const links = shellLinksOf({
    tasks,
    command: commandOrCurrent(options.command)
  });
  const appUserModelId = resolveAppUserModelId({
    given: options.appUserModelId,
    current: backend.currentAppUserModelId()
  });
  backend.replaceTasks({
    appUserModelId,
    links
  });
  const list = {
    tasks,
    taskOf(event) {
      const isTask = event.kind === ActivationKind.jumpList;
      return isTask ? tasks.find(task => task.id === event.taskId) : undefined;
    }
  } satisfies JumpList<Tasks>;
  return list;
}

/**
 * Deletes the app's jump list.
 *
 * @param options - The id (the process's own when omitted) and, for a test, the shell.
 * @throws {Error} When the AppUserModelID is not set or differs from `appUserModelId`.
 */
export function clearJumpList({ appUserModelId, backend = createJumpListNative() }: {
  appUserModelId?: string;
  backend?: JumpListBackend;
} = {}) {
  backend.deleteList(
    resolveAppUserModelId({
      given: appUserModelId,
      current: backend.currentAppUserModelId()
    })
  );
}
