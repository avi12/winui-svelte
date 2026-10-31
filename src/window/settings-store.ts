import { FAKE_SETTINGS_VARIABLE, fakeSettingsSource } from "./fake-settings.ts";
import { onTeardown } from "./teardown.ts";
import { uiThreadDispatcher } from "#src/scheduling.js";
import type { UIColorType } from "#src/winui.js";
import { AccessibilitySettings, UIColorType as ColorKind, UISettings } from "#src/winui.js";

interface Channels {
  a: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The part of `UISettings` and `AccessibilitySettings` that the library
 * reads; a test stands in for it.
 */
export interface SettingsSource {
  readonly textScaleFactor: number;
  readonly animationsEnabled: boolean;
  readonly advancedEffectsEnabled: boolean;
  readonly highContrast: boolean;
  getColorValue(color: UIColorType): Channels;
  onColorValuesChanged(callback: () => void): () => void;
  onTextScaleFactorChanged(callback: () => void): () => void;
  onAnimationsEnabledChanged(callback: () => void): () => void;
  onAdvancedEffectsEnabledChanged(callback: () => void): () => void;
  onHighContrastChanged(callback: () => void): () => void;
}

/**
 * The one reactive source of Windows' settings: `systemSettings`,
 * `mediaQuery`, `matchMedia` and the CSS runtime's `@media` watcher all read
 * and listen through it.
 */
export interface SettingsStore {
  readonly source: SettingsSource;
  /** Calls back, on the UI thread, whenever any setting changes; returns the way to stop. */
  subscribe(callback: () => void): () => void;
}

const LIGHT_FOREGROUND_WEIGHT = 8;
const LIGHT_FOREGROUND_BASE = 128;
const RED_WEIGHT = 2;
const GREEN_WEIGHT = 5;

/**
 * Whether the app runs in dark mode, by the standard test on the system's
 * foreground color: a light foreground is a dark theme.
 */
export function isDarkTheme(source: SettingsSource) {
  const { r, g, b } = source.getColorValue(ColorKind.Foreground);
  return RED_WEIGHT * r + GREEN_WEIGHT * g + b > LIGHT_FOREGROUND_WEIGHT * LIGHT_FOREGROUND_BASE;
}

/**
 * Makes the store over any source of settings and a way to reach the UI
 * thread: `UISettings` raises its events on a thread of its own.
 *
 * @param options - Where the settings come from, and how to run work on the UI thread.
 * @returns The store.
 */
export function createSettingsStore({ source, runOnUiThread }: {
  source: SettingsSource;
  runOnUiThread: (work: () => void) => void;
}) {
  return {
    source,
    subscribe(callback) {
      function notify() {
        runOnUiThread(callback);
      }
      const stops = [
        source.onColorValuesChanged(notify),
        source.onTextScaleFactorChanged(notify),
        source.onAnimationsEnabledChanged(notify),
        source.onAdvancedEffectsEnabledChanged(notify),
        source.onHighContrastChanged(notify)
      ];
      // The system raises these on threads of its own, so they end with the application.
      const forget = onTeardown(stopAll);
      function stopAll() {
        for (const stop of stops.splice(0)) {
          stop();
        }
      }

      return () => {
        forget();
        stopAll();
      };
    }
  } satisfies SettingsStore;
}

function guarded(subscribe: () => () => void) {
  // Outside a packaged app WinUI can refuse a subscription with "Element not
  // found"; the value is then still read live, only without a notification.
  try {
    return subscribe();
  } catch {
    return () => {};
  }
}

function createSystemStore() {
  const uiSettings = UISettings.create();
  const accessibility = new AccessibilitySettings();
  return createSettingsStore({
    source: {
      get textScaleFactor() {
        return uiSettings.textScaleFactor;
      },
      get animationsEnabled() {
        return uiSettings.animationsEnabled;
      },
      get advancedEffectsEnabled() {
        return uiSettings.advancedEffectsEnabled;
      },
      get highContrast() {
        return accessibility.highContrast;
      },
      getColorValue: color => uiSettings.getColorValue(color),
      onColorValuesChanged: callback => uiSettings.onColorValuesChanged(callback),
      onTextScaleFactorChanged: callback => uiSettings.onTextScaleFactorChanged(callback),
      onAnimationsEnabledChanged: callback => uiSettings.onAnimationsEnabledChanged(callback),
      onAdvancedEffectsEnabledChanged: callback => guarded(() => uiSettings.onAdvancedEffectsEnabledChanged(callback)),
      onHighContrastChanged: callback => guarded(() => accessibility.onHighContrastChanged(callback))
    },
    runOnUiThread: uiThreadDispatcher()
  });
}

function createStore() {
  const fakePath = process.env[FAKE_SETTINGS_VARIABLE];
  const isFake = fakePath !== undefined;
  return isFake ? createSettingsStore({
    source: fakeSettingsSource(fakePath),
    runOnUiThread: uiThreadDispatcher()
  }) : createSystemStore();
}

let shared: SettingsStore | null = null;

/**
 * The store over the machine's `UISettings` and `AccessibilitySettings`,
 * made on first use on the UI thread and kept: every reader shares it. When
 * the environment variable WINUI_SVELTE_FAKE_SETTINGS names a JSON file, the
 * store reads that file instead (a test drives the settings through it).
 *
 * @returns The shared store.
 */
export function systemSettingsStore() {
  shared ??= createStore();
  return shared;
}
