import { runUiaClient } from "./client.ts";
import type { UiaClient } from "./client.ts";
import { createUiaNativeBackend } from "./native.ts";

/**
 * Creates a UI Automation client, runs `use` with it, then releases every
 * element, range and COM pointer it made; the elements refuse to work after
 * that. Call it from a thread in a COM apartment, ideally a worker in the
 * multithreaded one (an apartment that pumps messages can hang on a target
 * that does not answer).
 *
 * @param use - The work; it may be async.
 * @returns What `use` returned.
 */
export function withUiaClient<T>(use: (client: UiaClient) => T | Promise<T>) {
  return runUiaClient({
    use,
    backend: createUiaNativeBackend()
  });
}
