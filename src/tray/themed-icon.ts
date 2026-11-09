import { createLightReader, PersonalizeValue } from "./personalize.ts";
import type { ThemedIconExtra } from "./tray-extras.ts";

/**
 * The extra that lets a tray icon's `icon` be `{ forLightTaskbar, forDarkTaskbar }`: pass it in `extras`
 * and the picture follows the taskbar's theme. Without it the registry read is not in the bundle.
 */
export const themedIcon: ThemedIconExtra = {
  kind: "themedIcon",
  createReader() {
    return createLightReader({
      value: PersonalizeValue.TASKBAR_IS_LIGHT,
      isLightWhenMissing: false
    });
  }
};
