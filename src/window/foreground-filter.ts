// Which window in front is "the user's app": the pure part of foreground
// tracking, fed by a source so a test needs no Windows.

/** The window classes of the shell and of Windows' Copilot focus frame; none of them is an app. */
export const ForegroundShellClass = {
  desktop: "Progman",
  desktopWorker: "WorkerW",
  taskbar: "Shell_TrayWnd",
  secondaryTaskbar: "Shell_SecondaryTrayWnd",
  copilotFocusFrame: "CopilotKeyPressFocusFrame"
} as const;

/** One window class of the shell that is not an app. */
export type ForegroundShellClass = typeof ForegroundShellClass[keyof typeof ForegroundShellClass];

const SHELL_CLASSES: ReadonlySet<string> = new Set(Object.values(ForegroundShellClass));
const NO_WINDOW = 0n;

/** What the tracker asks of Windows; a test stands in for it. */
export interface ForegroundSource {
  /** The window in front; 0n when none is. */
  foreground(): bigint;

  /** The window class of `hwnd`. */
  classOf(hwnd: bigint): string;

  /** The id of the process that owns `hwnd`. */
  processOf(hwnd: bigint): number;

  /** False once `hwnd` has been destroyed. */
  isWindow(hwnd: bigint): boolean;
}

/** The window in front, and whether it is an app the user works in. */
export interface ForegroundSnapshot {
  /** The window in front; null when no window has the foreground. */
  readonly hwnd: bigint | null;

  /** False for the shell, the desktop, a window of this app, and no window. */
  readonly isRealApp: boolean;
}

/** What the tracker takes. */
export interface ForegroundTrackerOptions {
  readonly source: ForegroundSource;

  /** The id of this app's process; its windows are not apps. */
  readonly ownProcessId: number;

  /** More windows that belong to the app, such as one of a sibling process. */
  readonly ownWindows?: (() => readonly bigint[]) | undefined;

  /** Window classes to skip besides `ForegroundShellClass`. */
  readonly ignoredClasses?: readonly string[] | undefined;

  /** Runs once for each change of the window in front. */
  readonly onChanged?: ((change: ForegroundSnapshot) => void) | undefined;
}

/**
 * Decides whether to bring the remembered app back: when it is known, and
 * the window in front is not an app (the shell, or a window of this app).
 * An app the user switched to meanwhile is left alone.
 *
 * @param options - The last real app, and the window in front now.
 * @returns True when the remembered app should be brought back.
 */
export function shouldRestore({ lastRealApp, foreground }: {
  lastRealApp: bigint | null;
  foreground: ForegroundSnapshot;
}) {
  const isKnown = lastRealApp !== null;
  return isKnown && !foreground.isRealApp;
}

/**
 * Follows the window in front. `check` reads it and tells `onChanged` only
 * when the handle differs from the last check; the class and the process of a
 * window are read once, when it is first seen.
 *
 * @param options - The source, the app's own windows and the classes to skip.
 * @returns `check`, and the state: `current`, `lastRealApp` and `foreground`.
 */
export function createForegroundTracker(options: ForegroundTrackerOptions) {
  const { source, ownProcessId, onChanged } = options;
  const ignoredClasses = new Set<string>([...SHELL_CLASSES, ...options.ignoredClasses ?? []]);
  const ignoredByWindow = new Map<bigint, boolean>();
  let current = NO_WINDOW;
  let lastRealApp: bigint | null = null;
  let snapshot: ForegroundSnapshot = {
    hwnd: null,
    isRealApp: false
  };

  function dropClosed() {
    for (const hwnd of ignoredByWindow.keys()) {
      const isGone = !source.isWindow(hwnd);
      if (isGone) {
        ignoredByWindow.delete(hwnd);
      }
    }
  }

  function isIgnored(hwnd: bigint) {
    const isIgnoredCached = ignoredByWindow.get(hwnd);
    const isKnown = isIgnoredCached !== undefined;
    if (isKnown) {
      return isIgnoredCached;
    }

    const isShellClass = ignoredClasses.has(source.classOf(hwnd));
    const isOwnProcess = source.processOf(hwnd) === ownProcessId;
    const isIgnoredWindow = isShellClass || isOwnProcess;
    ignoredByWindow.set(hwnd, isIgnoredWindow);
    return isIgnoredWindow;
  }

  function isRealApp(hwnd: bigint) {
    const isNone = hwnd === NO_WINDOW;
    const isListedAsOwn = options.ownWindows?.().includes(hwnd) ?? false;
    return !isNone && !isListedAsOwn && !isIgnored(hwnd);
  }

  function read({ isSilent }: { isSilent: boolean }) {
    const hwnd = source.foreground();
    const isUnchanged = hwnd === current;
    if (isUnchanged) {
      return;
    }

    dropClosed();
    current = hwnd;
    const isReal = isRealApp(hwnd);
    if (isReal) {
      lastRealApp = hwnd;
    }

    snapshot = {
      hwnd: hwnd === NO_WINDOW ? null : hwnd,
      isRealApp: isReal
    };

    if (!isSilent) {
      onChanged?.(snapshot);
    }
  }

  read({ isSilent: true });
  return {
    /** Reads the window in front; runs `onChanged` when it changed. */
    check() {
      read({ isSilent: false });
    },
    /** The window in front, or null. */
    get current() {
      return snapshot.hwnd;
    },
    /** The last window in front that was a real app, or null. */
    get lastRealApp() {
      return lastRealApp;
    },
    /** The window in front, and whether it is a real app. */
    get foreground() {
      return snapshot;
    }
  };
}
