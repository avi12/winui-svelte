import { startWindowsAppSdk } from "./bootstrap-core.ts";
import type { WindowsAppSdkOptions } from "./bootstrap-core.ts";
import { hasWindowsAppRuntimeDependency } from "./package-identity.ts";
import { initWinappsdk } from "@microsoft/dynwinrt";
import { bootstrapperFolders } from "#src/runtime-files.js";

export { WindowsAppRuntimeMissing } from "./bootstrap-core.ts";
export type { WindowsAppSdkOptions } from "./bootstrap-core.ts";
export { BootstrapMode, RuntimeSource } from "./bootstrap-mode.ts";
export { DpiAwareness, DpiAwarenessTooLow, processDpiAwareness } from "./dpi-awareness.ts";
export { hasPackageIdentity } from "./package-identity.ts";

/**
 * Starts the Windows App SDK on this thread, before any WinRT object exists.
 * Imports nothing of WinRT, so it is safe on a host's main thread. Call it on
 * the main thread: the environment it sets (the bootstrapper, PATH, the
 * WebView2 profile folder) reaches the process only from there, and a worker
 * started afterwards inherits it.
 *
 * @param options - Which runtime, where its bootstrapper is, and how to start it.
 * @returns `runtime`: `"package"` when the process's own package brought the
 *     runtime and the bootstrapper was skipped, `"bootstrapper"` otherwise.
 * @throws {Error} on a platform other than Windows x64 or arm64
 * @throws {WindowsAppRuntimeMissing} when the runtime is not installed
 */
export function initWindowsAppSdk(options: WindowsAppSdkOptions = {}) {
  return startWindowsAppSdk({
    options,
    runtimeProcess: {
      bootstrapperFolders,
      hasWindowsAppRuntimeDependency,
      initWinappsdk
    }
  });
}
