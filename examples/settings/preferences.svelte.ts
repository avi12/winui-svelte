import { Backdrop, WindowTheme } from "winui-svelte/enums";

const DEFAULT_TEXT_SIZE = 14;
export const LANGUAGES = ["English", "Hebrew", "French"] as const;

/**
 * Everything the user can change, in one place: the pages edit it, the window
 * reads it, so a setting has one home.
 */
class Preferences {
  language = $state(0);
  isStartupEnabled = $state(false);
  isTelemetryEnabled = $state(true);
  theme = $state<WindowTheme>(WindowTheme.system);
  backdrop = $state<Backdrop>(Backdrop.mica);
  textSize = $state(DEFAULT_TEXT_SIZE);
  userName = $state("");
}

export const preferences = new Preferences();
