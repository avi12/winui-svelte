import type { SettingsStore } from "./settings-store.ts";
import { isDarkTheme, systemSettingsStore } from "./settings-store.ts";
import type { MediaChange, MediaInputs, MediaStore } from "#src/css/media/features.js";
import { ColorGamut, MediaPresentation } from "#src/css/media/features.js";
import { defaultDelivery } from "#src/devices/delivery.js";
import { displayColor, windowsDisplayColor } from "#src/devices/display-color.js";
import { inputDeviceChanges, readInputCapabilities } from "#src/devices/input-capabilities.js";
import { isMeteredCost } from "#src/devices/network-information.svelte.js";
import type { NetworkSource } from "#src/devices/network-information.svelte.js";
import { windowsNetworkSource } from "#src/devices/network-information.svelte.js";
import { DisplayArea } from "#src/winui.js";

/** What an app or a test supplies beyond the settings: other answers, and the events that flip them. */
export interface MediaStoreOptions {
  readonly settings: SettingsStore;
  /** Answers that replace the defaults (the window's size and scale, the input devices, the display's colors). */
  readonly inputs?: Partial<MediaInputs>;
  /** Listens to a kind of change the settings do not carry (`viewport`, `scale`, `devices`...). */
  readonly watch?: Partial<Record<MediaChange, (callback: () => void) => () => void>>;
}

const FALLBACK_SCALE = 1;

function primaryDisplay() {
  // No display (a session with no desktop) leaves the size unknown.
  try {
    const { width, height } = DisplayArea.primary.outerBounds;
    return {
      width,
      height
    };
  } catch {
    return null;
  }
}

function stopNothing() {}

// The input devices coming and going, on the UI thread. Outside a packaged app
// WinRT can refuse the watcher; the devices are then read without a change
// notification.
function watchInputDevices(callback: () => void) {
  const deliver = defaultDelivery();
  try {
    return inputDeviceChanges()(() => deliver(callback));
  } catch {
    return stopNothing;
  }
}

// A reading of the internet connection; without one (no network profile, or
// WinRT refusing the class) the connection counts as not metered.
function isConnectionMetered(source: NetworkSource) {
  try {
    return isMeteredCost(source.read().costType);
  } catch {
    return false;
  }
}

// The reads and the events of the display color and the connection, made on
// the first use: a store nobody asks for these costs nothing.
function lazily<Value>(make: () => Value) {
  let made: Value | null = null;
  return () => {
    made ??= make();
    return made;
  };
}

function watchConnection(callback: () => void) {
  const deliver = defaultDelivery();
  try {
    return windowsNetworkSource().subscriptions[0]?.(() => deliver(callback)) ?? stopNothing;
  } catch {
    return stopNothing;
  }
}

/**
 * Makes the media store over a settings store; `inputs` replace the defaults
 * for what Windows' settings do not tell (a window's own size, the devices).
 *
 * @param options - The settings, and optionally other answers and events.
 * @returns The store.
 */
function createMediaStore({ settings, inputs = {}, watch = {} }: MediaStoreOptions) {
  const { source } = settings;
  const defaults = {
    viewport: primaryDisplay,
    display: primaryDisplay,
    scale: () => FALLBACK_SCALE,
    isDark: () => isDarkTheme(source),
    isHighContrast: () => source.highContrast,
    isAnimationEnabled: () => source.animationsEnabled,
    isTransparencyEnabled: () => source.advancedEffectsEnabled,
    presentation: () => MediaPresentation.windowed,
    devices: () => readInputCapabilities(),
    isHdr: () => false,
    gamut: () => ColorGamut.srgb,
    isMetered: () => false
  } satisfies MediaInputs;
  return {
    inputs: {
      ...defaults,
      ...inputs
    },
    subscribe({ changes, callback }) {
      const stops: (() => void)[] = [];
      if (changes.has("settings")) {
        stops.push(settings.subscribe(callback));
      }

      for (const change of changes) {
        const listen = watch[change];
        const isWatchable = listen !== undefined;
        if (isWatchable) {
          stops.push(listen(callback));
        }
      }

      return () => {
        for (const stop of stops) {
          stop();
        }
      };
    }
  } satisfies MediaStore;
}

/**
 * The media store over the machine's settings, made on first use on the UI
 * thread.
 *
 * @param options - Other answers and events than the settings'.
 * @returns The store.
 */
export function systemMediaStore({ watch, inputs, ...options }: Omit<MediaStoreOptions, "settings"> = {}) {
  const color = lazily(() => displayColor(windowsDisplayColor()));
  const network = lazily(windowsNetworkSource);
  return createMediaStore({
    settings: systemSettingsStore(),
    inputs: {
      isHdr: () => color().isHdr(),
      gamut: () => color().gamut(),
      isMetered: () => isConnectionMetered(network()),
      ...inputs
    },
    watch: {
      devices: watchInputDevices,
      connection: watchConnection,
      dynamicRange: callback => color().subscribe(callback),
      ...watch
    },
    ...options
  });
}
