import { createMessagePump } from "./message-pump.ts";
import { createMessageSource, requestFineTimerResolution } from "./native.ts";
import { runTeardown } from "./teardown.ts";
import { stopAllTimers, useDispatcherTimers } from "./timers.ts";
import { uiTimers } from "./ui-timers.ts";
import { startXamlThread } from "./xaml-thread.ts";
import { installMedia } from "#src/components/media.js";
import { installXaml } from "#src/components/xaml.js";
import { installCss } from "#src/css/index.js";
import { onUiError, reportUiError } from "#src/ui-errors.js";
import type { UiErrorListener } from "#src/ui-errors.js";
import * as winui from "#src/winui.js";
import { Application } from "#src/winui.js";

// DispatcherShutdownMode.OnLastWindowClose: the XAML runtime posts WM_QUIT when
// the last window closes, as `Application.Start` arranged; with the manager
// made by hand (xaml-thread.ts) the mode must be set explicitly.
const ON_LAST_WINDOW_CLOSE = 0;

/** How `runWindow` starts the application. */
export interface RunWindowOptions {
  /**
   * Runs on the UI thread once WinUI is up (its own resources installed, and
   * the components' `<style>` sheets merged over them, and the XAML reader the
   * template and resources props use ready): the place to register controls
   * and open windows.
   */
  onStart: () => void;

  /**
   * The Web APIs to define on this thread before `onStart`: the
   * `install...` functions of `winui-svelte/web-apis` and its subpaths
   * (`installNotification`, and so on). Nothing is installed that is not listed.
   */
  webApis?: ReadonlyArray<() => unknown>;

  /**
   * Called with every exception app code throws on the UI thread and WinUI
   * would otherwise see as a bare native failure: an event handler, a prop
   * the control refuses, a timer or dispatcher callback, `onStart`. The stack
   * is already on stderr; this is the place for a crash report or a dialog.
   * Like `window.onerror`, it runs after the exception is caught, and the
   * application goes on.
   */
  onerror?: UiErrorListener;
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
  const stopListening = options.onerror === undefined ? undefined : onUiError(options.onerror);
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
        Application.current.dispatcherShutdownMode = ON_LAST_WINDOW_CLOSE;
        useDispatcherTimers();
        installCss(winui);
        installXaml();
        installMedia();
        for (const install of options.webApis ?? []) {
          install();
        }

        options.onStart();
      } catch (error) {
        reportUiError({
          error,
          origin: "onStart"
        });
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
    stopListening?.();
    restoreTimerResolution();
    stopAllTimers();
    runTeardown();
    held.release();
  }
}

/** Stops the timers and ends the application: `runWindow`'s promise settles. */
export function exitApplication() {
  stopAllTimers();
  Application.current.exit();
}
