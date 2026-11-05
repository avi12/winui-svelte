import { removeTrayIconsAtExit } from "./exit-hook.ts";
import { createTrayNative } from "./native.ts";
import type { TrayNative } from "./native.ts";
import { createTrayIconWith } from "./tray-core.ts";
import type { TrayIconOptions, TrayScheduler } from "./tray-core.ts";
import { startTimer } from "#src/window/timers.js";

/** What `createTrayIcon` takes beyond the icon's own options: a test's stand-ins. */
export interface TrayIconSeams {
  /** The Win32 calls; the real ones by default. */
  readonly native?: TrayNative;

  /** The timer that polls the pointer; the UI thread's dispatcher by default. */
  readonly schedule?: TrayScheduler;
}

/**
 * Puts an icon in the notification area (the system tray). Call it on the UI
 * thread. The icon is removed when you call `remove`, and at process exit.
 * WinUI has no tray API, so this speaks to the shell directly; the README
 * lists what that cannot do.
 */
export function createTrayIcon(options: TrayIconOptions & TrayIconSeams) {
  removeTrayIconsAtExit();
  return createTrayIconWith({
    ...options,
    native: options.native ?? createTrayNative(),
    schedule: options.schedule ?? startTimer,
    now: Date.now
  });
}
