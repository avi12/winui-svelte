import { failedWith, failure, ShellFailure, SUCCESS } from "./kinds.ts";
import { isShellPath, pathExists } from "./paths.ts";
import { StorageFile } from "#winui/windows/storage/StorageFile";
import { Launcher } from "#winui/windows/system/Launcher";
import { LauncherOptions } from "#winui/windows/system/LauncherOptions";

/** The Windows calls `openWith` makes; a test gives a fake. */
export interface OpenWithBackend {
  /** Shows the "How do you want to open this?" list for the file; true when an app was started. */
  showPicker(path: string): Promise<boolean>;
}

/** What `openWith` takes. */
export interface OpenWithOptions {
  /** The full path of the file. */
  readonly path: string;

  /** Stands in for Windows; the tests give one. */
  readonly backend?: OpenWithBackend;
}

async function showPicker(path: string) {
  const options = new LauncherOptions();
  options.displayApplicationPicker = true;
  return Launcher.launchFileAsync(await StorageFile.getFileFromPathAsync(path), options);
}

/**
 * Opens the Windows "Open with" list for a file, so the user picks the app
 * for this once. It shows a dialog and starts whatever the user picks, which
 * is why it takes a file and never a program. To open with the default app,
 * use `launchFile` from `winui-svelte/data-transfer`.
 *
 * @param options - The path.
 * @returns `ok` when the user picked an app and it started; `aborted` when
 *   the list was closed.
 */
export async function openWith({ path, backend = { showPicker } }: OpenWithOptions) {
  if (!isShellPath(path)) {
    return failure({
      reason: ShellFailure.INVALID,
      message: `'${path}' is not a full path`
    });
  }

  if (!pathExists(path)) {
    return failure({
      reason: ShellFailure.NOT_FOUND,
      message: `'${path}' does not exist`
    });
  }

  try {
    const isStarted = await backend.showPicker(path);
    return isStarted ? SUCCESS : failure({
      reason: ShellFailure.ABORTED,
      message: "no app was picked"
    });
  } catch (error) {
    return failedWith(error);
  }
}
