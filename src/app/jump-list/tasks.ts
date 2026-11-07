import { currentProgramCommand, quoteArgument } from "#src/app/activation/command.js";
import type { ProgramCommand } from "#src/app/activation/command.js";
import { JUMP_LIST_ID_PATTERN, jumpListArgument } from "#src/app/activation/jump-list-argument.js";
import type { PictureSource } from "#src/picture-source.js";
import path from "node:path";

const REMOTE_PICTURE_PATTERN = /^(?:data|https?|ms-appx):/iu;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;

/** One entry of the Tasks list in the taskbar button's right-click menu. */
export interface JumpListTask<TaskId extends string = string> {
  /**
   * Names the task. It comes back as `taskId` of the `jumpList` activation;
   * letters, digits, `_`, `.` and `-`, up to 64, unique in the list.
   */
  readonly id: TaskId;

  /** The text of the entry. */
  readonly title: string;

  /** The arguments the app is started with; they come back in the activation's `arguments`. */
  readonly arguments: readonly string[];

  /** The tooltip of the entry. */
  readonly description?: string;

  /** The path of an .ico file, or of an .exe or .dll with `iconIndex`; the app's own icon when omitted. */
  readonly icon?: PictureSource;

  /** The icon's index in an .exe or .dll; 0 by default. */
  readonly iconIndex?: number;

  /** The folder the new copy starts in; the app's own when omitted. */
  readonly workingDirectory?: string;
}

/** What `IShellLink` is given for one task. */
export interface ShellLinkSpec {
  readonly path: string;

  /** The whole argument line, quoted for `CommandLineToArgvW`. */
  readonly arguments: string;
  readonly title: string;
  readonly description: string | null;
  readonly iconPath: string | null;
  readonly iconIndex: number;
  readonly workingDirectory: string | null;
}

/** The shell calls a jump list makes; a test stands in for Windows. */
export interface JumpListBackend {
  /** The process's explicit AppUserModelID, or null when none was set. */
  currentAppUserModelId(): string | null;

  /** Replaces the Tasks of the list of `appUserModelId` with `links`, in order. */
  replaceTasks(options: {
    appUserModelId: string;
    links: readonly ShellLinkSpec[];
  }): void;

  /** Deletes the whole list of `appUserModelId`. */
  deleteList(appUserModelId: string): void;
}

function iconPathOf(task: JumpListTask) {
  const { icon } = task;
  const isNone = icon === undefined;
  if (isNone) {
    return null;
  }

  const isRemote = REMOTE_PICTURE_PATTERN.test(icon);
  if (isRemote) {
    throw new TypeError(`the icon of task '${task.id}' must be a file path; a jump list cannot draw a URI`);
  }

  return path.resolve(icon);
}

function checkTask({ task, seen }: {
  task: JumpListTask;
  seen: Set<string>;
}) {
  const isIdValid = JUMP_LIST_ID_PATTERN.test(task.id);
  if (!isIdValid) {
    throw new TypeError(`'${task.id}' is not a valid jump list task id: use letters, digits, _, . and -, up to 64`);
  }

  const isDuplicate = seen.has(task.id);
  if (isDuplicate) {
    throw new TypeError(`the jump list task id '${task.id}' is used twice`);
  }

  seen.add(task.id);
  const isTitleValid = task.title.length > 0 && !CONTROL_PATTERN.test(task.title);
  if (!isTitleValid) {
    throw new TypeError(`the title of task '${task.id}' must be text without control characters`);
  }
}

/**
 * The shell link of each task: this process's launch command, then the task
 * marker, then the task's own arguments, all quoted for one command line.
 *
 * @param options - The tasks and the command that starts the app.
 * @returns One spec per task, in order.
 * @throws {TypeError} For an invalid or repeated id, an empty title or a remote icon.
 */
export function shellLinksOf({ tasks, command }: {
  tasks: readonly JumpListTask[];
  command: ProgramCommand;
}) {
  const seen = new Set<string>();
  return tasks.map(task => {
    checkTask({
      task,
      seen
    });
    const line = [...command.arguments, jumpListArgument(task.id), ...task.arguments].map(quoteArgument);
    return {
      path: command.program,
      arguments: line.join(" "),
      title: task.title,
      description: task.description ?? null,
      iconPath: iconPathOf(task),
      iconIndex: task.iconIndex ?? 0,
      workingDirectory: task.workingDirectory ?? null
    } satisfies ShellLinkSpec;
  });
}

/**
 * The id the list is made for: the process's own, which must be the one given.
 * Windows shows a list only on the windows of its AppUserModelID, and shows
 * nothing, without an error, when they differ.
 *
 * @param options - The id the caller gave, and the id the process has.
 * @returns The id.
 * @throws {Error} When the process has none, or a different one.
 */
export function resolveAppUserModelId({ given, current }: {
  given: string | undefined;
  current: string | null;
}) {
  const isUnnamed = current === null;
  if (isUnnamed) {
    throw new Error("a jump list needs the process's AppUserModelID: give <Window> an appUserModelId (or call joinAppUserModel) first");
  }

  const isMismatch = given !== undefined && given !== current;
  if (isMismatch) {
    throw new Error(`the jump list's appUserModelId '${given}' differs from the process's '${current}', so Windows would show nothing`);
  }

  return current;
}

/**
 * The launch command a task uses, this process's unless one is given.
 *
 * @param command - The command a caller gave.
 * @returns The command.
 */
export function commandOrCurrent(command: ProgramCommand | undefined) {
  return command ?? currentProgramCommand();
}
