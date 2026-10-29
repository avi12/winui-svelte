import { uiThreadDispatcher } from "#src/scheduling.js";
import type { UIColorType } from "#src/winui.js";
import { UIColorType as ColorKind, UISettings } from "#src/winui.js";
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

/** The part of `UISettings` that `systemSettings` reads; a test stands in for it. */
export interface SettingsSource {
  readonly textScaleFactor: number;
  readonly animationsEnabled: boolean;
  getColorValue(color: UIColorType): Channels;
  onColorValuesChanged(callback: () => void): () => void;
  onTextScaleFactorChanged(callback: () => void): () => void;
  onAnimationsEnabledChanged(callback: () => void): () => void;
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
}

function hexOf(channel: number) {
  return channel.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_CHANNEL, "0");
}

// The text form colorOf reads back: #rrggbb, or #aarrggbb with transparency.
function hexColorOf({ a, r, g, b }: Channels) {
  const alpha = a === OPAQUE ? "" : hexOf(a);
  return `#${alpha}${hexOf(r)}${hexOf(g)}${hexOf(b)}`;
}

/**
 * Makes the settings reader over any source of them, and a way to reach the
 * UI thread: `systemSettings` is this over `UISettings`.
 *
 * @param options - Where the settings come from, and how to run work on the UI thread.
 * @returns The settings, read live and reactive.
 */
export function observeSettings({ source, runOnUiThread }: {
  source: SettingsSource;
  runOnUiThread: (work: () => void) => void;
}) {
  // Reading a field inside an effect subscribes to the source for as long as
  // the effect lives; outside one it only reads. UISettings raises its events
  // on a thread of its own, so the change is handed to the UI thread.
  const subscribe = createSubscriber(update => {
    function notify() {
      runOnUiThread(update);
    }
    const stops = [
      source.onColorValuesChanged(notify),
      source.onTextScaleFactorChanged(notify),
      source.onAnimationsEnabledChanged(notify)
    ];
    return () => {
      for (const stop of stops) {
        stop();
      }
    };
  });
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
    }
  } satisfies SystemSettings;
}

/**
 * Reads the user's Windows settings (accent color, text scale, animation
 * effects) as reactive values. Call it once on the UI thread, in a `.svelte`
 * script or a `.svelte.ts` module, and keep the result: `UISettings` is
 * created with it.
 *
 * @returns The settings, which update when the user changes them.
 */
export function systemSettings() {
  return observeSettings({
    source: UISettings.create(),
    runOnUiThread: uiThreadDispatcher()
  });
}
