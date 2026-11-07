import type { SystemBackend } from "./system-backend.ts";
import type { MemoryInfo } from "./system-types.ts";

/** `chrome.system.memory`. */
export class SystemMemory {
  private readonly backend: SystemBackend;

  /** Made by `createChromeSystem`. */
  constructor(backend: SystemBackend) {
    this.backend = backend;
  }

  /**
   * Reads the physical memory.
   *
   * @returns A promise of the installed and the free bytes.
   */
  async getInfo() {
    return {
      capacity: this.backend.totalMemory(),
      availableCapacity: this.backend.freeMemory()
    } satisfies MemoryInfo;
  }
}
