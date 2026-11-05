import { systemSettingsStore } from "./settings-store.ts";

/**
 * Whether Windows' animation effects are off, which is how the user asks for
 * reduced motion; false where there are no settings (off the UI thread, or no
 * Windows), which leaves the motion as asked.
 */
export function isMotionReducedBySystem() {
  try {
    return !systemSettingsStore().source.animationsEnabled;
  } catch {
    return false;
  }
}
