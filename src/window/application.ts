import { installCss } from "#src/css/index.js";
import * as winui from "#src/winui.js";
import { Application } from "#src/winui.js";

/** How `runWindow` starts the application. */
export interface RunWindowOptions {
  /**
   * Runs on the UI thread once WinUI is up (its own resources installed, and
   * the components' `<style>` sheets merged over them): the place to register
   * controls and open windows.
   */
  onStart: () => void;
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
  await Application.startScheduled(() => {
    Application.create(() => {
      installCss(winui);
      options.onStart();
    });
  });
}

/** Ends the application: `runWindow`'s promise settles. */
export function exitApplication() {
  Application.current.exit();
}
