import type { ResolvedMenuItem } from "./menu/types.ts";
import type { MenuFlyout } from "#src/components/generated/bindings.js";

/** The props of `TrayMenuFlyout`. */
export interface TrayMenuFlyoutProps {
  /**
   * Gives the lines to draw, as `resolveMenu` makes them. Called when the
   * flyout opens and again after an item that stays open.
   */
  readonly resolve: () => readonly ResolvedMenuItem[];

  /** Called when the menu ends: a pick, or a dismissal. */
  readonly onclose: () => void;

  /** Gives the native `MenuFlyout` each time one is built, to read or hide it. */
  readonly onflyout?: (flyout: MenuFlyout) => void;
}
