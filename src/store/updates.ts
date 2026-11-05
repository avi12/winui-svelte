import { NO_PACKAGE, packaged } from "./reply.ts";
import type { StoreBackend, StoreWindow } from "./types.ts";
import { windowsStoreBackend } from "./windows-backend.ts";

/** What `checkForUpdates` takes. */
export interface UpdateOptions {
  /** The window that owns any Store dialog. */
  readonly window?: StoreWindow;

  /** Stands in for Windows; the tests give one. */
  readonly backend?: StoreBackend;
}

/**
 * Asks the Store which updates this app and its optional packages have
 * (`GetAppAndOptionalStorePackageUpdatesAsync`). Nothing is downloaded; the
 * `install` of the answer does that, silently, for exactly those updates.
 *
 * @param options - Optional.
 * @returns The updates and whether any is mandatory, or `hasPackage: false` outside a package.
 */
export async function checkForUpdates({ window, backend = windowsStoreBackend() }: UpdateOptions = {}) {
  const isPackaged = backend.hasPackage();
  if (!isPackaged) {
    return NO_PACKAGE;
  }

  return packaged(await backend.checkUpdates(window));
}
