import { isSea } from "node:sea";

const SPACE = " ";
const QUOTE = "\"";
const BACKSLASH = "\\";
const NEEDS_QUOTES = /[\s"]/u;
const TRAILING_BACKSLASHES = /(\\*)$/u;
const BACKSLASHES_BEFORE_QUOTE = /(\\*)"/gu;

/** The program and the arguments that start this app again. */
export interface LaunchCommand {
  readonly executable: string;
  readonly arguments: readonly string[];
}

function quoteArgument(argument: string) {
  const isPlain = argument.length > 0 && !NEEDS_QUOTES.test(argument);
  if (isPlain) {
    return argument;
  }

  const escaped = argument
    .replace(BACKSLASHES_BEFORE_QUOTE, (_match, backslashes: string) => `${backslashes}${backslashes}${BACKSLASH}${QUOTE}`)
    .replace(TRAILING_BACKSLASHES, (_match, backslashes: string) => `${backslashes}${backslashes}`);
  return `${QUOTE}${escaped}${QUOTE}`;
}

/**
 * Joins arguments into one command line the way `CommandLineToArgvW` reads
 * it back.
 *
 * @param argumentList - The arguments, none of them the program.
 * @returns The command line.
 */
export function joinCommandLine(argumentList: readonly string[]) {
  return argumentList.map(quoteArgument).join(SPACE);
}

/**
 * The command that starts an app again: Node, its own flags, the entry
 * script, then the app's arguments.
 *
 * @param options - Every part of the command.
 * @returns The program and its arguments.
 */
export function commandOf({ executable, nodeFlags, script, appArguments }: {
  executable: string;
  nodeFlags: readonly string[];
  script: string;
  appArguments: readonly string[];
}) {
  return {
    executable,
    arguments: [...nodeFlags, script, ...appArguments]
  } satisfies LaunchCommand;
}

/**
 * The command that starts this app again, copied from the running process.
 * A single executable application (a Node `node:sea` build) is its own
 * program: `process.execPath` is the exe, it has no entry script and takes no
 * Node flags, so the command is the exe and the app's arguments.
 *
 * @param options - The arguments the new copy gets, the entry script when it
 *   is not `process.argv[1]`, and `isSingleExecutable` (the running process's
 *   answer by default; a test stands in).
 * @returns The program and its arguments.
 * @throws {Error} When the process has no entry script and is not a single
 *   executable (an interactive session).
 */
export function launchCommand({ appArguments, entryScript = process.argv[1], isSingleExecutable = isSea() }: {
  appArguments: readonly string[];
  entryScript?: string | undefined;
  isSingleExecutable?: boolean;
}) {
  if (isSingleExecutable) {
    return {
      executable: process.execPath,
      arguments: appArguments
    } satisfies LaunchCommand;
  }

  const isScriptMissing = entryScript === undefined;
  if (isScriptMissing) {
    throw new Error("relaunch and restartAfterCrash need a process started from a script");
  }

  return commandOf({
    executable: process.execPath,
    nodeFlags: process.execArgv,
    script: entryScript,
    appArguments
  });
}
