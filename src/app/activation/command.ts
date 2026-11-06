const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const NEEDS_QUOTES_PATTERN = /[\s"]/u;
const PLACEHOLDER = "\"%1\"";

/** A program and its leading arguments: what Windows starts for an activation. */
export interface ProgramCommand {
  /** The full path of the program. */
  readonly program: string;

  /** Arguments that come before the ones Windows adds (the script of `node.exe`, say). */
  readonly arguments: readonly string[];
}

/**
 * The command that starts this app again: this Node and its flags, then the
 * entry script. A bundled executable passes its own `command` instead.
 *
 * @returns The command.
 * @throws {Error} When the process has no entry script (a REPL).
 */
export function currentProgramCommand() {
  const [, entry] = process.argv;
  const isEntryMissing = entry === undefined;
  if (isEntryMissing) {
    throw new Error("this process has no entry script to start again: pass the command to run");
  }

  return {
    program: process.execPath,
    arguments: [...process.execArgv, entry]
  } satisfies ProgramCommand;
}

/**
 * Quotes one argument by the rules of `CommandLineToArgvW`, so that the
 * program reads back exactly this text.
 *
 * @param argument - The text.
 * @returns The text, quoted when it needs it.
 * @throws {Error} When it holds a control character, which a registry value cannot carry.
 */
export function quoteArgument(argument: string) {
  const hasControl = CONTROL_PATTERN.test(argument);
  if (hasControl) {
    throw new Error("a command line cannot hold a control character");
  }

  const isPlain = argument.length > 0 && !NEEDS_QUOTES_PATTERN.test(argument);
  if (isPlain) {
    return argument;
  }

  const escaped = argument.replace(/(\\*)"/gu, "$1$1\\\"").replace(/(\\+)$/u, "$1$1");
  return `"${escaped}"`;
}

function quotedProgram(program: string) {
  const isQuoted = program.includes("\"");
  if (isQuoted) {
    throw new Error("a program path cannot hold a quote");
  }

  quoteArgument(program);
  return `"${program}"`;
}

/**
 * Joins a command and further arguments into the one line Windows stores.
 * The program is always quoted.
 *
 * @param options - The command, the arguments after it and whether the last
 *   one is `%1`, the place Windows puts the opened item.
 * @returns The command line.
 */
export function commandLineOf({ command, extra = [], hasPlaceholder = false }: {
  command: ProgramCommand;
  extra?: readonly string[];
  hasPlaceholder?: boolean;
}) {
  const rest = [...command.arguments, ...extra].map(quoteArgument);
  const tail = hasPlaceholder ? [...rest, PLACEHOLDER] : rest;
  return [quotedProgram(command.program), ...tail].join(" ");
}
