import { Package } from "./bindings.ts";
import { packageUpdateStateOf, SignatureKind, signatureKindOf } from "./states.ts";
import type { PackageInfo } from "./types.ts";
import { hasPackageIdentity } from "#src/window/package-identity.js";

/**
 * The running package, read from `Package.Current`. Call it only when
 * `hasPackageIdentity` is true: without an identity `Package.Current` throws.
 *
 * @returns What the package is.
 */
export function windowsPackageInfo() {
  const current = Package.current;
  const { id } = current;
  const { major, minor, build, revision } = id.version;
  return {
    name: id.name,
    fullName: id.fullName,
    familyName: id.familyName,
    publisher: id.publisher,
    version: `${major}.${minor}.${build}.${revision}`,
    installedPath: current.installedPath,
    isDevelopmentMode: current.isDevelopmentMode,
    isFromStore: signatureKindOf(current.signatureKind) === SignatureKind.store
  } satisfies PackageInfo;
}

export { hasPackageIdentity };

/**
 * Asks the package's `.appinstaller` source whether a newer version exists
 * (`Package.CheckUpdateAvailabilityAsync`). Call it only inside a package.
 *
 * @returns The availability.
 */
export async function windowsCheckPackageUpdate() {
  const result = await Package.current.checkUpdateAvailabilityAsync();
  return packageUpdateStateOf(result.availability);
}
