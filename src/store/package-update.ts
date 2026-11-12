import type { IdentityOptions } from "./identity.ts";
import { NO_PACKAGE, packaged } from "./reply.ts";
import type { PackageUpdateState } from "./states.ts";
import { windowsStoreBackend } from "./windows-backend.ts";

/**
 * Asks the package's own installer source (the `.appinstaller` file it was
 * installed from) whether a newer version exists
 * (`Package.CheckUpdateAvailabilityAsync`). It is for a package that did not
 * come from the Store; nothing is downloaded or installed.
 *
 * @param options - Optional.
 * @returns The availability, or `hasPackage: false` outside a package.
 */
export async function checkPackageUpdate({ backend = windowsStoreBackend() }: IdentityOptions = {}) {
  const isPackaged = backend.hasPackage();
  if (!isPackaged) {
    return NO_PACKAGE;
  }

  const state: PackageUpdateState = await backend.checkPackageUpdate();
  return packaged(state);
}
