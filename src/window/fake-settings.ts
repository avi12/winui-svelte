import type { SettingsSource } from "./settings-store.ts";
import { startTimer } from "./timers.ts";

// A stand-in for Windows' settings that a test rewrites as a JSON file, so a
// real window can be driven through dark mode, high contrast, reduced motion,
// transparency and text size without touching the machine's own settings.
// settings-store.ts makes it only when WINUI_SVELTE_FAKE_SETTINGS names a file.

/** The environment variable that names the file; nothing is read when it is not set. */
export const FAKE_SETTINGS_VARIABLE = "WINUI_SVELTE_FAKE_SETTINGS";

const POLL_MILLISECONDS = 100;
const ACCENT = {
  a: 255,
  r: 0,
  g: 120,
  b: 212
};
const WHITE = {
  a: 255,
  r: 255,
  g: 255,
  b: 255
};
const BLACK = {
  a: 255,
  r: 0,
  g: 0,
  b: 0
};
const FOREGROUND = 1;

const DEFAULTS = {
  isDark: false,
  isHighContrast: false,
  isAnimationEnabled: true,
  isTransparencyEnabled: true,
  textScaleFactor: 1
};

function wrongType({ name, type }: {
  name: string;
  type: string;
}) {
  return new TypeError(`${FAKE_SETTINGS_VARIABLE}: "${name}" must be a ${type}`);
}

// A boolean field of the file, or its default; a value of another type is refused by name.
function booleanField({ given, name, isFallback }: {
  given: ReadonlyMap<string, unknown>;
  name: string;
  isFallback: boolean;
}) {
  const value = given.get(name);
  const isAbsent = value === undefined;
  if (isAbsent) {
    return isFallback;
  }

  const isBoolean = typeof value === "boolean";
  if (!isBoolean) {
    throw wrongType({
      name,
      type: "boolean"
    });
  }

  return value;
}

function numberField({ given, name, fallback }: {
  given: ReadonlyMap<string, unknown>;
  name: string;
  fallback: number;
}) {
  const value = given.get(name);
  const isAbsent = value === undefined;
  if (isAbsent) {
    return fallback;
  }

  const isNumber = typeof value === "number";
  if (!isNumber) {
    throw wrongType({
      name,
      type: "number"
    });
  }

  return value;
}

function parseValues(text: string) {
  const parsed: unknown = JSON.parse(text);
  const isObject = typeof parsed === "object" && parsed !== null;
  const given = new Map<string, unknown>(isObject ? Object.entries(parsed) : []);
  return {
    isDark: booleanField({
      given,
      name: "isDark",
      isFallback: DEFAULTS.isDark
    }),
    isHighContrast: booleanField({
      given,
      name: "isHighContrast",
      isFallback: DEFAULTS.isHighContrast
    }),
    isAnimationEnabled: booleanField({
      given,
      name: "isAnimationEnabled",
      isFallback: DEFAULTS.isAnimationEnabled
    }),
    isTransparencyEnabled: booleanField({
      given,
      name: "isTransparencyEnabled",
      isFallback: DEFAULTS.isTransparencyEnabled
    }),
    textScaleFactor: numberField({
      given,
      name: "textScaleFactor",
      fallback: DEFAULTS.textScaleFactor
    })
  };
}

/**
 * The settings of the JSON file at `path`, read live: `isDark`,
 * `isHighContrast`, `isAnimationEnabled`, `isTransparencyEnabled` (booleans)
 * and `textScaleFactor` (a number), each optional. A change to the file is
 * noticed within a tenth of a second.
 *
 * @param path - The file; the test rewrites it.
 * @returns A settings source.
 */
export function fakeSettingsSource(path: string) {
  const { readFileSync } = process.getBuiltinModule("node:fs");
  const listeners = new Set<() => void>();
  let stopPolling: (() => void) | null = null;
  let last = "";

  function read() {
    return parseValues(readFileSync(path, "utf8"));
  }

  function poll() {
    const now = JSON.stringify(read());
    const isChanged = now !== last;
    if (isChanged) {
      last = now;
      for (const listener of listeners) {
        listener();
      }
    }
  }

  function listen(callback: () => void) {
    listeners.add(callback);
    const isFirst = stopPolling === null;
    if (isFirst) {
      last = JSON.stringify(read());
      stopPolling = startTimer({
        milliseconds: POLL_MILLISECONDS,
        onTick: poll
      });
    }

    return () => {
      listeners.delete(callback);
      const isLast = listeners.size === 0;
      if (isLast) {
        stopPolling?.();
        stopPolling = null;
      }
    };
  }

  return {
    get textScaleFactor() {
      return read().textScaleFactor;
    },
    get animationsEnabled() {
      return read().isAnimationEnabled;
    },
    get advancedEffectsEnabled() {
      return read().isTransparencyEnabled;
    },
    get highContrast() {
      return read().isHighContrast;
    },
    getColorValue(color) {
      const isForeground = color === FOREGROUND;
      const foreground = read().isDark ? WHITE : BLACK;
      return isForeground ? foreground : ACCENT;
    },
    onColorValuesChanged: listen,
    onTextScaleFactorChanged: listen,
    onAnimationsEnabledChanged: listen,
    onAdvancedEffectsEnabledChanged: listen,
    onHighContrastChanged: listen
  } satisfies SettingsSource;
}
