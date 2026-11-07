import { failure, ShellFailure, SUCCESS } from "./kinds.ts";
import { isShellPath } from "./paths.ts";
import { createWindowsRegistry } from "#src/app/activation/native.js";
import { isOwned, OWNED, OWNER_VALUE } from "#src/app/activation/registration.js";
import type { RegistryBackend } from "#src/app/activation/registry.js";
import { requireIdentifier } from "#src/app/activation/scheme.js";

const APP_PATHS = "Software\\Microsoft\\Windows\\CurrentVersion\\App Paths";
const EXECUTABLE_EXTENSION = ".exe";
const DEFAULT_VALUE = "";
const PATH_VALUE = "Path";

// Names Windows or common tools resolve through App Paths already.
const SYSTEM_NAMES = new Set([
  "cmd", "powershell", "pwsh", "explorer", "notepad", "regedit", "mspaint", "calc", "control", "msedge", "chrome",
  "firefox", "iexplore", "wt", "code", "node", "python", "git"
]);

/** What `registerAppPath` takes. */
export interface AppPathOptions {
  /** The name to type in Run or `Win+R`, without `.exe`: letters, digits, `.`, `_` and `-`. */
  readonly name: string;

  /** The full path of the `.exe` it starts; required to register. */
  readonly program: string;

  /** Stands in for the registry; the tests give one. */
  readonly registry?: RegistryBackend;
}

function keyOf(name: string) {
  return `${APP_PATHS}\\${name}${EXECUTABLE_EXTENSION}`;
}

function nameProblem(name: string) {
  try {
    requireIdentifier(name);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  const isSystemName = SYSTEM_NAMES.has(name.toLowerCase()) || name.toLowerCase().endsWith(EXECUTABLE_EXTENSION);
  return isSystemName ? `'${name}' is a name Windows or a common tool already answers to` : undefined;
}

function invalid(message: string) {
  return failure({
    reason: ShellFailure.INVALID,
    message
  });
}

/**
 * Makes `name` (typed in Run, or given to `ShellExecute`) start a program, by
 * a key under `HKEY_CURRENT_USER\...\App Paths`. The key is written only when
 * it is free or was made by this package (it carries a marker value), so
 * another program's alias is never replaced. Only the current user's hive is
 * reachable.
 *
 * @param options - The name, the program and, in tests, a registry.
 * @returns `owned-by-another` when something else has the name.
 */
export function registerAppPath({ name, program, registry = createWindowsRegistry() }: AppPathOptions) {
  const problem = nameProblem(name);
  const hasProblem = problem !== undefined;
  if (hasProblem) {
    return invalid(problem);
  }

  const isExecutable = program.toLowerCase().endsWith(EXECUTABLE_EXTENSION);
  const isProgramValid = isShellPath(program) && isExecutable;
  if (!isProgramValid) {
    return invalid(`'${program}' is not a full path ending in ${EXECUTABLE_EXTENSION}`);
  }

  const key = keyOf(name);
  const isTaken = registry.hasKey(key) && !isOwned({
    registry,
    key
  });
  if (isTaken) {
    return failure({
      reason: ShellFailure.OWNED_BY_ANOTHER,
      message: `'${name}${EXECUTABLE_EXTENSION}' is already registered by another program`
    });
  }

  const directory = program.slice(0, program.lastIndexOf("\\"));
  registry.setString({
    key,
    name: DEFAULT_VALUE,
    value: program
  });
  registry.setString({
    key,
    name: PATH_VALUE,
    value: directory
  });
  registry.setString({
    key,
    name: OWNER_VALUE,
    value: OWNED
  });
  return SUCCESS;
}

/**
 * Takes an alias away, if `registerAppPath` made it.
 *
 * @param options - The name and, in tests, a registry.
 * @returns `ok` when it was removed; `not-found` when there was none;
 *   `owned-by-another` when something else made it, which is left alone.
 */
export function unregisterAppPath({ name, registry = createWindowsRegistry() }: {
  readonly name: string;
  readonly registry?: RegistryBackend;
}) {
  const problem = nameProblem(name);
  const hasProblem = problem !== undefined;
  if (hasProblem) {
    return invalid(problem);
  }

  const key = keyOf(name);
  const isRegistered = registry.hasKey(key);
  if (!isRegistered) {
    return failure({
      reason: ShellFailure.NOT_FOUND,
      message: `'${name}${EXECUTABLE_EXTENSION}' is not registered`
    });
  }

  if (!isOwned({
    registry,
    key
  })) {
    return failure({
      reason: ShellFailure.OWNED_BY_ANOTHER,
      message: `'${name}${EXECUTABLE_EXTENSION}' was registered by another program`
    });
  }

  registry.deleteTree(key);
  return SUCCESS;
}
