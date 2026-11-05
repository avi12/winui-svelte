import { Package } from "./bindings.ts";
import type { PackageInfo } from "./types.ts";
import { bind, numberOf, pointerOf, withMemory } from "#src/win32-calls.js";

// GetCurrentPackageFullName (appmodel.h) is the cheap check: called with a
// zero length it answers APPMODEL_ERROR_NO_PACKAGE outside a package and
// ERROR_INSUFFICIENT_BUFFER inside one, without the exception that
// Package.Current throws.

const NO_PACKAGE_ERROR = 15_700;
const LENGTH_BYTES = 4;

const getCurrentPackageFullName = bind({
  dll: "kernel32.dll",
  entryPoint: "GetCurrentPackageFullName",
  parameters: ["pointer", "pointer"],
  returnType: "i32"
});

/**
 * Whether this process has a package identity (MSIX, or a sparse package).
 *
 * @returns False for plain Node.js, Electron and `pnpm dev`.
 */
export function hasPackageIdentity() {
  return withMemory({
    size: LENGTH_BYTES,
    alignment: LENGTH_BYTES,
    use(length) {
      length.writeU32(0, 0);
      const status = numberOf(
        getCurrentPackageFullName.invoke([pointerOf(length), pointerOf(null)]).returnValue
      );
      return status !== NO_PACKAGE_ERROR;
    }
  });
}

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
