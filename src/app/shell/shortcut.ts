import type { ShellBackend } from "./backend.ts";
import { failedWith, failure, ShellFailure, SUCCESS } from "./kinds.ts";
import { createShellNative } from "./native.ts";
import { isShellPath, pathExists } from "./paths.ts";
import { quoteArgument } from "#src/app/activation/command.js";

const SHORTCUT_EXTENSION = ".lnk";

/** What `createShortcut` takes. */
export interface ShortcutOptions {
  /** Where to write the shortcut: a full path ending in `.lnk`. */
  readonly path: string;

  /** The full path of the file, folder or program it opens. */
  readonly target: string;

  /** Arguments for the target; each is quoted for Windows, so a space or a quote in one stays in it. */
  readonly arguments?: readonly string[];

  /** The folder the target starts in. */
  readonly workingDirectory?: string;

  /** The icon: a file (an `.ico`, `.exe` or `.dll`) and the icon's index in it, 0 by default. */
  readonly icon?: {
    readonly path: string;
    readonly index?: number;
  };

  /** The tooltip text. */
  readonly description?: string;

  /** Replace a shortcut that is already there; false by default. */
  readonly shouldOverwrite?: boolean;

  /** Stands in for Windows; the tests give one. */
  readonly backend?: ShellBackend;
}

/** What `readShortcut` gives back. */
export interface ShortcutInfo {
  readonly target: string;

  /** The command line after the target, as stored. */
  readonly arguments: string;
  readonly workingDirectory: string;
  readonly icon: {
    readonly path: string;
    readonly index: number;
  } | undefined;
  readonly description: string;
}

function isShortcutPath(value: string) {
  return isShellPath(value) && value.toLowerCase().endsWith(SHORTCUT_EXTENSION);
}

function invalid(message: string) {
  return failure({
    reason: ShellFailure.INVALID,
    message
  });
}

function invalidPathMessage({ path, workingDirectory, icon, target }: Pick<ShortcutOptions, "path" | "target" | "workingDirectory" | "icon">) {
  if (!isShortcutPath(path)) {
    return `'${path}' is not a full path ending in ${SHORTCUT_EXTENSION}`;
  }

  if (!isShellPath(target)) {
    return `'${target}' is not a full path`;
  }

  const hasBadDirectory = workingDirectory !== undefined && !isShellPath(workingDirectory);
  if (hasBadDirectory) {
    return `'${workingDirectory}' is not a full path`;
  }

  const hasBadIcon = icon !== undefined && !isShellPath(icon.path);
  return hasBadIcon ? `'${icon.path}' is not a full path` : undefined;
}

/**
 * Writes a `.lnk` shortcut file with `IShellLink`. It writes only the file at
 * `path`; the target is not opened, run or required to exist.
 *
 * @param options - The shortcut.
 * @returns Whether it was written; `exists` when `path` is taken and
 *   `shouldOverwrite` is not set.
 */
export function createShortcut(options: ShortcutOptions) {
  const { path, target, icon, backend = createShellNative() } = options;
  const message = invalidPathMessage(options);
  const hasMessage = message !== undefined;
  if (hasMessage) {
    return invalid(message);
  }

  const isTaken = pathExists(path);
  const shouldKeep = isTaken && options.shouldOverwrite !== true;
  if (shouldKeep) {
    return failure({
      reason: ShellFailure.EXISTS,
      message: `'${path}' already exists`
    });
  }

  try {
    backend.writeShortcut({
      path,
      target,
      arguments: (options.arguments ?? []).map(quoteArgument).join(" "),
      workingDirectory: options.workingDirectory ?? "",
      iconPath: icon?.path ?? "",
      iconIndex: icon?.index ?? 0,
      description: options.description ?? ""
    });
  } catch (error) {
    return failedWith(error);
  }

  return SUCCESS;
}

/**
 * Reads where a shortcut points, as it is stored: the target is not searched
 * for if it moved, and nothing is run.
 *
 * @param options - The `.lnk` path and, in tests, a backend.
 * @returns The shortcut's properties, or why it could not be read.
 */
export function readShortcut({ path, backend = createShellNative() }: {
  readonly path: string;
  readonly backend?: ShellBackend;
}) {
  if (!isShortcutPath(path)) {
    return invalid(`'${path}' is not a full path ending in ${SHORTCUT_EXTENSION}`);
  }

  if (!pathExists(path)) {
    return failure({
      reason: ShellFailure.NOT_FOUND,
      message: `'${path}' does not exist`
    });
  }

  try {
    const properties = backend.readShortcut(path);
    const hasIcon = properties.iconPath.length > 0;
    return {
      ok: true,
      target: properties.target,
      arguments: properties.arguments,
      workingDirectory: properties.workingDirectory,
      icon: hasIcon ? {
        path: properties.iconPath,
        index: properties.iconIndex
      } : undefined,
      description: properties.description
    };
  } catch (error) {
    return failedWith(error);
  }
}
