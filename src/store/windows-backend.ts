import type { StoreBackend } from "./types.ts";
import { hasPackageIdentity, windowsPackageInfo } from "./windows-identity.ts";
import { windowsOnPackageProgress, windowsStartupTask } from "./windows-packages.ts";
import { windowsCheckUpdates, windowsLicense, windowsOnOfflineLicensesChanged } from "./windows-store.ts";

/**
 * The backend over Windows: `StoreContext`, `Package`, `PackageCatalog` and
 * `StartupTask`.
 *
 * @returns The calls the store modules make.
 */
export function windowsStoreBackend() {
  return {
    hasPackage: hasPackageIdentity,
    packageInfo: windowsPackageInfo,
    license: windowsLicense,
    onOfflineLicensesChanged: windowsOnOfflineLicensesChanged,
    checkUpdates: windowsCheckUpdates,
    onPackageProgress: windowsOnPackageProgress,
    startupTask: windowsStartupTask,
    poll({ milliseconds, tick }) {
      // In a window host setInterval runs on the UI thread's dispatcher (see window/timers.ts).
      const timer = setInterval(tick, milliseconds);
      return () => clearInterval(timer);
    }
  } satisfies StoreBackend;
}
