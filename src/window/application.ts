import { createMessagePump } from "./message-pump.ts";
import { createMessageSource, requestFineTimerResolution } from "./native.ts";
import { stopAllTimers, useDispatcherTimers } from "./timers.ts";
import { uiTimers } from "./ui-timers.ts";
import { startXamlThread } from "./xaml-thread.ts";
import { installMedia } from "#src/components/media.js";
import { installXaml } from "#src/components/xaml.js";
import { installCss } from "#src/css/index.js";
import * as winui from "#src/winui.js";
import { Application } from "#src/winui.js";

/** How `runWindow` starts the application. */
export interface RunWindowOptions {
  /**
   * Runs on the UI thread once WinUI is up (its own resources installed, and
   * the components' `<style>` sheets merged over them, and the XAML reader the
   * template and resources props use ready): the place to register controls
   * and open windows.
   */
  onStart: () => void;
}

/**
 * Starts WinUI on this thread, which must be the UI thread (thread.ts); the
 * promise settles when the application exits, and rejects with what `onStart`
 * threw.
 *
 * The thread's loop is the message pump (message-pump.ts), not
 * `Application.Start`'s own: WinUI's messages and libuv's callbacks take
 * turns, so everything Node does in the background (timers, `fs`, sockets,
 * `fetch`, `WebSocket`, worker messages, child processes) completes on this
 * thread while the windows run. Each message is handled with no JavaScript
 * under it, so the promise continuations a handler queues run before the next
 * message.
 */
export async function runWindow(options: RunWindowOptions) {
  const { libuv } = uiTimers();
  const ended = Promise.withResolvers<void>();
  const pump = createMessagePump({
    source: createMessageSource(),
    schedule(callback) {
      libuv.setImmediate(callback);
    },
    onQuit: ended.resolve
  });
  const held = startXamlThread(() => {
    Application.create(() => {
      try {
        useDispatcherTimers();
        installCss(winui);
        installXaml();
        installMedia();
        options.onStart();
      } catch (error) {
        ended.reject(error);
        exitApplication();
      }
    });
  });
  const restoreTimerResolution = requestFineTimerResolution();
  libuv.setImmediate(pump.start);
  try {
    await ended.promise;
  } finally {
    pump.stop();
    restoreTimerResolution();
    stopAllTimers();
    held.manager.release();
    held.controller.release();
  }
}

/** Stops the timers and ends the application: `runWindow`'s promise settles. */
export function exitApplication() {
  stopAllTimers();
  Application.current.exit();
}
