import type { SystemBackend } from "./system-backend.ts";
import { windowsSystemBackend } from "./system-backend.ts";
import { SystemCpu } from "./system-cpu.ts";
import { SystemDisplay } from "./system-display.ts";
import { SystemMemory } from "./system-memory.ts";
import { SystemStorage } from "./system-storage.ts";

/** What `createChromeSystem` takes. */
export interface ChromeSystemOptions {
  /** Where the readings come from; Windows by default, a test gives a fake. */
  readonly backend?: SystemBackend | undefined;
}

/**
 * `chrome.system` for a Windows app: `cpu`, `memory`, `storage` and `display`,
 * each with the names and promises of Chrome's. Idle is the web
 * `IdleDetector` and desktop capture the web `getDisplayMedia`, so neither is
 * here. Call it where `chrome.system` is wanted; nothing is read until a
 * method is called.
 *
 * @param options - The backend, for a test.
 * @returns The four namespaces.
 */
export function createChromeSystem(options: ChromeSystemOptions = {}) {
  const backend = options.backend ?? windowsSystemBackend();
  return {
    cpu: new SystemCpu(backend),
    memory: new SystemMemory(backend),
    storage: new SystemStorage(backend),
    display: new SystemDisplay(backend)
  };
}
