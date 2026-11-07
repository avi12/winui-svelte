import { balloons } from "./balloons.ts";
import { bounds } from "./bounds.ts";
import { removeTrayIconsAtExit } from "./exit-hook.ts";
import { createTrayNative } from "./native.ts";
import type { TrayNative } from "./native.ts";
import { themedIcon } from "./themed-icon.ts";
import { createTrayCore } from "./tray-core.ts";
import type { TrayIconHandle, TrayIconOptions, TrayScheduler } from "./tray-core.ts";
import { startTimer } from "#src/window/timers.js";

/** What `createTrayIcon` takes beyond the icon's own options: a test's stand-ins. */
export interface TrayIconSeams {
  /** The Win32 calls; the real ones by default. */
  readonly native?: TrayNative;

  /** The timer that polls the pointer; the UI thread's dispatcher by default. */
  readonly schedule?: TrayScheduler;
}

const WINDOWED_EXTRAS = [balloons, bounds, themedIcon] as const;

/** The Win32 calls of a windowed tray icon: the real ones, with the balloon writer of the `balloons` extra. */
export function createWindowedTrayNative() {
  return createTrayNative({ writeBalloon: balloons.writeBalloon });
}

/**
 * Puts an icon in the notification area (the system tray). Call it on the UI
 * thread. The icon is removed when you call `remove`, and at process exit.
 * WinUI has no tray API, so this speaks to the shell directly; the README
 * lists what that cannot do.
 */
export function createTrayIcon(options: TrayIconOptions & TrayIconSeams) {
  removeTrayIconsAtExit();
  const handle: TrayIconHandle = createTrayCore({
    ...options,
    extras: WINDOWED_EXTRAS,
    native: options.native ?? createWindowedTrayNative(),
    schedule: options.schedule ?? startTimer,
    now: Date.now
  });
  return handle;
}
