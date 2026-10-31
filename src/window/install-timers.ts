import { createPromiseTimers } from "./promise-timers.ts";
import { uiTimers } from "./ui-timers.ts";
import { syncBuiltinESMExports } from "node:module";
import { promisify } from "node:util";

let isInstalled = false;

/**
 * Replaces the thread's `setTimeout`, `setInterval`, `setImmediate` and their
 * `clear` functions with the UI thread's scheduler, in the globals and in
 * `node:timers` and `node:timers/promises`, so they run on the dispatcher
 * once the window's loop starts (see `uiTimers`). `runOnUiThread` calls it
 * first; calling it again does nothing.
 */
export function installUiTimers() {
  if (isInstalled) {
    return;
  }

  isInstalled = true;
  const { scheduler } = uiTimers();
  const promises = createPromiseTimers(scheduler);
  Object.defineProperty(scheduler.setTimeout, promisify.custom, { value: promises.setTimeout });
  Object.defineProperty(scheduler.setImmediate, promisify.custom, { value: promises.setImmediate });
  const functions = {
    setTimeout: scheduler.setTimeout,
    setInterval: scheduler.setInterval,
    setImmediate: scheduler.setImmediate,
    clearTimeout: scheduler.clearTimeout,
    clearInterval: scheduler.clearInterval,
    clearImmediate: scheduler.clearImmediate
  };
  Object.assign(globalThis, functions);
  Object.assign(process.getBuiltinModule("node:timers"), functions);
  Object.assign(process.getBuiltinModule("node:timers/promises"), promises);
  syncBuiltinESMExports();
}
