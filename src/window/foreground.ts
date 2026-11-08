import { createForegroundTracker } from "./foreground-filter.ts";
import type { ForegroundSnapshot } from "./foreground-filter.ts";
import { createForegroundSource, startShellHook } from "./foreground-native.ts";
import { addMessageHook } from "./message-hooks.ts";
import { startTimer } from "./timers.ts";

export { bringWindowToFront } from "./foreground-native.ts";
export { ForegroundShellClass, shouldRestore } from "./foreground-filter.ts";
export type { ForegroundSnapshot } from "./foreground-filter.ts";

const DEFAULT_INTERVAL = 100;
const MINIMUM_INTERVAL = 16;

/** How `trackForeground` learns that the window in front changed. */
export const ForegroundTracking = {
  /** The shell posts a message on each change; nothing runs while the foreground is still. Falls back to `polling`. */
  events: "events",
  /** A timer reads `GetForegroundWindow` every `intervalMilliseconds`. */
  polling: "polling"
} as const;

/** One way of following the foreground. */
export type ForegroundTracking = typeof ForegroundTracking[keyof typeof ForegroundTracking];

/** What `trackForeground` takes. */
export interface TrackForegroundOptions {
  /** Runs on the UI thread once for each change of the window in front. */
  readonly onChanged?: ((change: ForegroundSnapshot) => void) | undefined;

  /** Windows of this app that are not apps, besides every window of this process; for a window of a sibling process. */
  readonly ownWindows?: (() => readonly bigint[]) | undefined;

  /** Window classes to skip besides `ForegroundShellClass`. */
  readonly ignoredClasses?: readonly string[] | undefined;

  /** `events` by default. */
  readonly tracking?: ForegroundTracking | undefined;

  /** The time between reads in `polling` (100 by default, 16 at least). */
  readonly intervalMilliseconds?: number | undefined;
}

/**
 * Follows which app is in front, ignoring the shell (desktop, taskbar,
 * Windows' Copilot focus frame) and this app's own windows. Call it on the UI
 * thread, which must run the package's message pump (any `runWindow` app
 * does). In `events` mode the shell tells the app when the foreground changes
 * through a hidden window, so an idle foreground costs nothing; in `polling`
 * mode one `GetForegroundWindow` call runs per interval, and the class and the
 * process of a window are read once per window.
 *
 * @param options - The change callback, the app's own windows and the way to follow.
 * @returns `current` (the window in front), `lastRealApp` (the last app that
 *   was in front), `foreground` (both facts of the window in front), `check`
 *   (reads now) and `stop` (idempotent).
 */
export function trackForeground(options: TrackForegroundOptions = {}) {
  const tracker = createForegroundTracker({
    source: createForegroundSource(),
    ownProcessId: process.pid,
    ownWindows: options.ownWindows,
    ignoredClasses: options.ignoredClasses,
    onChanged: options.onChanged
  });
  const hook = options.tracking === ForegroundTracking.polling ? null : startShellHook();
  const removeMessageHook = hook === null
    ? undefined
    : addMessageHook(({ hwnd, id }) => {
      const isShellMessage = hwnd === hook.hwnd && id === hook.messageId;
      if (isShellMessage) {
        tracker.check();
      }

      return isShellMessage;
    });
  const stopTimer = hook === null
    ? startTimer({
      milliseconds: Math.max(options.intervalMilliseconds ?? DEFAULT_INTERVAL, MINIMUM_INTERVAL),
      onTick: tracker.check
    })
    : undefined;
  let isStopped = false;
  return {
    get current() {
      return tracker.current;
    },
    get lastRealApp() {
      return tracker.lastRealApp;
    },
    get foreground() {
      return tracker.foreground;
    },
    check: tracker.check,
    /** Stops following; calling it again does nothing. */
    stop() {
      if (isStopped) {
        return;
      }

      isStopped = true;
      removeMessageHook?.();
      stopTimer?.();
      hook?.stop();
    }
  };
}
