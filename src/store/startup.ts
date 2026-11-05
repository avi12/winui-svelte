import { NO_PACKAGE, packaged } from "./reply.ts";
import type { StoreBackend } from "./types.ts";
import { windowsStoreBackend } from "./windows-backend.ts";

/** What `getStartupTask` takes. */
export interface StartupTaskOptions {
  /** The `TaskId` of the `uap5:StartupTask` extension in the package manifest. */
  readonly taskId: string;

  /** Stands in for Windows; the tests give one. */
  readonly backend?: StoreBackend;
}

/**
 * A startup task of the package, the one that starts the app when the user
 * signs in (`StartupTask.GetAsync`). `enable` is a request: the user, or
 * policy, may refuse, so read the state that comes back.
 *
 * @param options - The task's id.
 * @returns The task, or `hasPackage: false` outside a package.
 */
export async function getStartupTask({ taskId, backend = windowsStoreBackend() }: StartupTaskOptions) {
  const isPackaged = backend.hasPackage();
  if (!isPackaged) {
    return NO_PACKAGE;
  }

  return packaged(await backend.startupTask(taskId));
}
