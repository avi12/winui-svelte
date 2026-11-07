import type { ShellBackend } from "./backend.ts";
import { failure, ShellFailure } from "./kinds.ts";
import { createShellNative } from "./native.ts";
import { isShellPath, pathExists } from "./paths.ts";

/** What `trash` takes. */
export interface TrashOptions {
  /** Full paths of the files or folders to recycle. */
  readonly paths: readonly string[];

  /** Stands in for Windows; the tests give one. */
  readonly backend?: ShellBackend;
}

/**
 * Moves files and folders to the Recycle Bin, so the user can restore them.
 * It acts on the user's real files. It never deletes for good: when Windows
 * would have to (a drive without a bin, a file too big for it) Windows asks
 * and nothing is removed unless the user agrees. No path is touched unless
 * every path passes the checks first.
 *
 * @param options - The paths.
 * @returns Whether they were recycled.
 */
export function trash({ paths, backend = createShellNative() }: TrashOptions) {
  const isEmpty = paths.length === 0;
  if (isEmpty) {
    return failure({
      reason: ShellFailure.INVALID,
      message: "no path was given"
    });
  }

  const invalid = paths.find(path => !isShellPath(path));
  const hasInvalid = invalid !== undefined;
  if (hasInvalid) {
    return failure({
      reason: ShellFailure.INVALID,
      message: `'${invalid}' is not a full path`
    });
  }

  const missing = paths.find(path => !pathExists(path));
  const hasMissing = missing !== undefined;
  if (hasMissing) {
    return failure({
      reason: ShellFailure.NOT_FOUND,
      message: `'${missing}' does not exist`
    });
  }

  return backend.recycle(paths);
}
