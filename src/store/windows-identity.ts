import { Package } from "./bindings.ts";
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
    isDevelopmentMode: current.isDevelopmentMode
  } satisfies PackageInfo;
}

export { hasPackageIdentity };
