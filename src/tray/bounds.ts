import type { BoundsExtra } from "./tray-extras.ts";

/**
 * The extra that adds `bounds` to a tray icon: pass it in `extras` and the handle says where the shell
 * draws the icon.
 */
export const bounds: BoundsExtra = {
  kind: "bounds",
  extend(context) {
    return {
      bounds() {
        return context.isRegistered() ? context.iconRect() : null;
      }
    };
  }
};
