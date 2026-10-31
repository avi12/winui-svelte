import { reportUiError } from "#src/ui-errors.js";

// What must be undone while the Node environment is still alive. WinUI and the
// system raise events on their own (a window's last messages, a setting
// changing on another thread), and a handler that is still registered when the
// environment closes is called into it: the callback fails, WinUI takes the
// failure for its own and the process ends with 0xC000027B. `runWindow` runs
// these as the application ends, before WinUI is shut down.

const callbacks = new Set<() => void>();

/**
 * Registers `callback` to run when the application ends.
 *
 * @param callback - Undoes something that would otherwise outlive the application.
 * @returns A function that withdraws it, for when the owner ends first.
 */
export function onTeardown(callback: () => void) {
  callbacks.add(callback);
  return () => {
    callbacks.delete(callback);
  };
}

/**
 * Runs every registered callback, the latest first, once. One that throws is
 * reported and the rest still run.
 */
export function runTeardown() {
  const pending = [...callbacks].reverse();
  callbacks.clear();
  for (const callback of pending) {
    try {
      callback();
    } catch (error) {
      reportUiError({
        error,
        origin: "teardown"
      });
    }
  }
}
