import type { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { bindDll, DWORD_BYTES, POINTER_BYTES, withMemory } from "#src/win32-calls.js";

// Two questions of the process's package identity, answered with kernel32 calls
// only, no WinRT: this module is on the path of `winui-svelte/bootstrap`, which
// promises to import nothing of WinRT. GetCurrentPackageFullName (appmodel.h)
// is the cheap check: called with a zero length it answers
// APPMODEL_ERROR_NO_PACKAGE outside a package and ERROR_INSUFFICIENT_BUFFER
// inside one. GetCurrentPackageInfo lists the package graph, whose framework
// packages tell whether the Windows App SDK is already loaded for the process.

const NO_PACKAGE_ERROR = 15_700;
const INSUFFICIENT_BUFFER_ERROR = 122;
const SUCCESS = 0;
const PACKAGE_FILTER_HEAD = 0x10;
const PACKAGE_FILTER_DIRECT = 0x20;
const FRAMEWORK_PREFIX = "Microsoft.WindowsAppRuntime";
// PACKAGE_INFO on 64-bit Windows: reserved, flags, path, full name, family name,
// then the PACKAGE_ID (reserved, architecture, version, name, publisher, ...).
const PACKAGE_INFO_BYTES = 80;
const NAME_OFFSET = 48;
const COUNT_OFFSET = DWORD_BYTES;

const appModel = bindDll({
  dll: "kernel32.dll",
  functions: {
    currentPackageFullName: ["GetCurrentPackageFullName", ["pointer", "pointer"], "i32"],
    currentPackageInfo: ["GetCurrentPackageInfo", ["u32", "pointer", "pointer", "pointer"], "i32"]
  }
});

/**
 * Whether this process has a package identity (MSIX, or a sparse package).
 *
 * @returns False for plain Node.js, Electron and `pnpm dev`.
 */
export function hasPackageIdentity() {
  return withMemory({
    size: DWORD_BYTES,
    alignment: DWORD_BYTES,
    use(length) {
      length.writeU32(0, 0);
      return appModel.currentPackageFullName(length, null) !== NO_PACKAGE_ERROR;
    }
  });
}

function nameAt({ buffer, address }: {
  buffer: DynComRawMemory;
  address: bigint;
}) {
  const start = Number(address - buffer.pointer().address);
  const remaining = Number(buffer.size) - start;
  const [name = ""] = buffer.readBytes(start, remaining).toString("utf16le").split("\0");
  return name;
}

function packageNames({ buffer, count }: {
  buffer: DynComRawMemory;
  count: number;
}) {
  return Array.from({ length: count }, (_, iPackage) => {
    const address = buffer.readU64(iPackage * PACKAGE_INFO_BYTES + NAME_OFFSET);
    return nameAt({
      buffer,
      address
    });
  });
}

// The two-call pattern: the first call, given no buffer, reports the size.
function packageGraphNames() {
  const flags = PACKAGE_FILTER_HEAD | PACKAGE_FILTER_DIRECT;
  return withMemory({
    size: DWORD_BYTES * 2,
    alignment: DWORD_BYTES,
    use(sizes) {
      const count = sizes.pointer(COUNT_OFFSET).address;
      sizes.writeU32(0, 0);
      const isSized = appModel.currentPackageInfo(flags, sizes, null, count) === INSUFFICIENT_BUFFER_ERROR;
      if (!isSized) {
        return [];
      }

      return withMemory({
        size: sizes.readU32(0),
        alignment: POINTER_BYTES,
        use(buffer) {
          const isFilled = appModel.currentPackageInfo(flags, sizes, buffer, count) === SUCCESS;
          return isFilled ? packageNames({
            buffer,
            count: sizes.readU32(COUNT_OFFSET)
          }) : [];
        }
      });
    }
  });
}

/**
 * Whether a Windows App SDK framework package is in this process's package
 * graph, which is the case when the manifest declares the `PackageDependency`:
 * WinRT and WinUI then activate with no bootstrapper, and the bootstrapper
 * refuses to run. A sparse package has an identity and may have no such
 * dependency.
 *
 * @returns False outside a package and in a package without the framework.
 */
export function hasWindowsAppRuntimeDependency() {
  const isPackaged = hasPackageIdentity();
  return isPackaged && packageGraphNames().some(name => name.startsWith(FRAMEWORK_PREFIX));
}
