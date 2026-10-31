import { stopAllTimers, useDispatcherTimers } from "./timers.ts";
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

  /**
   * The Web APIs to define on this thread before `onStart`: the
   * `install...` functions of `winui-svelte/web-apis` and its subpaths
   * (`installNotification`, and so on). Nothing is installed that is not listed.
   */
  webApis?: ReadonlyArray<() => unknown>;
}

/**
 * Starts WinUI on this thread, which must be the UI thread (thread.ts); the
 * promise settles when the application exits.
 *
 * Scheduled rather than started in place: WinUI's loop then runs from a libuv
 * callback with no JavaScript under it, so each event handler drains the
 * promise continuations it queues. Started from JavaScript, the loop keeps
 * that script on the stack for good, and no `await` ever resumes.
 */
export async function runWindow(options: RunWindowOptions) {
  try {
    await Application.startScheduled(() => {
      Application.create(() => {
        useDispatcherTimers();
        installCss(winui);
        installXaml();
        installMedia();
        for (const install of options.webApis ?? []) {
          install();
        }

        options.onStart();
      });
    });
  } finally {
    stopAllTimers();
  }
}

/** Stops the timers and ends the application: `runWindow`'s promise settles. */
export function exitApplication() {
  stopAllTimers();
  Application.current.exit();
}
