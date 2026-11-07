import type { SystemBackend } from "./system-backend.ts";
import type { StorageUnitInfo } from "./system-types.ts";

/**
 * `chrome.system.storage`: `getInfo` only. `onAttached` and `onDetached` are
 * left out because Windows tells an app about a drive coming or going only
 * through a hidden window's `WM_DEVICECHANGE`, or a `DeviceWatcher` that needs
 * a package identity; a caller who needs it calls `getInfo` again.
 */
export class SystemStorage {
  private readonly backend: SystemBackend;

  /** Made by `createChromeSystem`. */
  constructor(backend: SystemBackend) {
    this.backend = backend;
  }

  /**
   * Lists the drives with a letter.
   *
   * @returns A promise of one record per drive: the root as its id, the
   * letter as its name, whether it is fixed or removable, and its size.
   */
  async getInfo() {
    const drives = await this.backend.drives();
    return drives.map(drive => ({
      id: drive.root,
      name: drive.label,
      type: drive.type,
      capacity: drive.capacity
    } satisfies StorageUnitInfo));
  }
}
