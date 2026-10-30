import { createSettingsStore, isDarkTheme, systemSettingsStore } from "./settings-store.ts";
import type { SettingsStore } from "./settings-store.ts";
import { UIColorType as ColorKind } from "#src/winui.js";
import { createSubscriber } from "svelte/reactivity";

const OPAQUE = 255;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_CHANNEL = 2;

interface Channels {
  a: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The user's Windows settings that an app follows, read live. Every field is
 * reactive: read it in markup, `$derived` or `$effect` and it updates when the
 * user changes the setting, with no polling.
 */
export interface SystemSettings {
  /**
   * The accent color the user picked, as `#rrggbb`: a value any color prop
   * takes.
   */
  readonly accentColor: string;

  /** The text size scale from Settings, Accessibility, Text size: 1 is 100%, 1.5 is 150%. */
  readonly textScaleFactor: number;

  /** False when the user turned animation effects off (Settings, Accessibility, Visual effects). */
  readonly isAnimationEnabled: boolean;

  /** True while a high contrast theme is on (Settings, Accessibility, Contrast themes). */
  readonly isHighContrast: boolean;

  /** True while Windows is in dark mode (Settings, Personalization, Colors, Choose your mode). */
  readonly isDarkTheme: boolean;

  /** False when the user turned transparency effects off (Settings, Accessibility, Visual effects). */
  readonly isTransparencyEnabled: boolean;
}

function hexOf(channel: number) {
  return channel.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_CHANNEL, "0");
}

// The text form colorOf reads back: #rrggbb, or #aarrggbb with transparency.
function hexColorOf({ a, r, g, b }: Channels) {
  const alpha = a === OPAQUE ? "" : hexOf(a);
  return `#${alpha}${hexOf(r)}${hexOf(g)}${hexOf(b)}`;
}

function readStore(store: SettingsStore) {
  // Reading a field inside an effect subscribes to the store for as long as
  // the effect lives; outside one it only reads.
  const subscribe = createSubscriber(update => store.subscribe(update));
  const { source } = store;
  return {
    get accentColor() {
      subscribe();
      return hexColorOf(source.getColorValue(ColorKind.Accent));
    },
    get textScaleFactor() {
      subscribe();
      return source.textScaleFactor;
    },
    get isAnimationEnabled() {
      subscribe();
      return source.animationsEnabled;
    },
    get isHighContrast() {
      subscribe();
      return source.highContrast;
    },
    get isDarkTheme() {
      subscribe();
      return isDarkTheme(source);
    },
    get isTransparencyEnabled() {
      subscribe();
      return source.advancedEffectsEnabled;
    }
  } satisfies SystemSettings;
}

/**
 * Makes the settings reader over any source of them, and a way to reach the UI
 * thread: `systemSettings` is this over `UISettings`.
 *
 * @param options - Where the settings come from, and how to run work on the UI thread.
 * @returns The settings, read live and reactive.
 */
export function observeSettings(options: Parameters<typeof createSettingsStore>[0]) {
  return readStore(createSettingsStore(options));
}

/**
 * Reads the user's Windows settings (accent color, text scale, animation
 * effects, high contrast, dark mode, transparency) as reactive values. Call it
 * once on the UI thread, in a `.svelte` script or a `.svelte.ts` module.
 *
 * @returns The settings, which update when the user changes them.
 */
export function systemSettings() {
  return readStore(systemSettingsStore());
}
