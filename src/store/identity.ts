import type { StoreBackend } from "./types.ts";
import { windowsStoreBackend } from "./windows-backend.ts";

/** What the calls that read the process take. */
export interface IdentityOptions {
  /** Stands in for Windows; the tests give one. */
  readonly backend?: StoreBackend;
}

/**
 * Whether this process has a package identity (an MSIX package or a sparse
 * package). Plain Node.js, Electron and `pnpm dev` have none, and every call
 * of `winui-svelte/store` that needs one reports `hasPackage: false` there.
 *
 * @param options - Optional.
 * @returns True inside a package.
 */
export function hasPackage({ backend = windowsStoreBackend() }: IdentityOptions = {}) {
  return backend.hasPackage();
}

/**
 * The running package: name, full name, family name, publisher, version and
 * where it is installed.
 *
 * @param options - Optional.
 * @returns The package, or null when the process has no package identity.
 */
export function getPackageInfo({ backend = windowsStoreBackend() }: IdentityOptions = {}) {
  const isPackaged = backend.hasPackage();
  if (!isPackaged) {
    return null;
  }

  return backend.packageInfo();
}
