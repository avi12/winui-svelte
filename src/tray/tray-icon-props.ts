import type { TrayIconHandle, TrayIconOptions } from "./tray-core.ts";
import type { ScreenPoint, TrayMenuContext } from "./tray-menu.ts";
import type { Snippet } from "svelte";

/** The props of `TrayIcon`: the options of `createTrayIcon`, the menu, and the live handle to bind. */
export interface TrayIconComponentProps extends TrayIconOptions {
  /** `bind:handle` gives `notify`, `bounds` and `remove`. */
  handle?: TrayIconHandle | undefined;

  /**
   * The menu: a flyout (`MenuFlyout`, `CommandBarFlyout`, any `Flyout`)
   * written with `open`. It opens at the pointer on a right click, in a
   * one-pixel window that exists only while the menu is open.
   */
  menu?: Snippet<[TrayMenuContext]> | undefined;

  /**
   * Where the menu is open, in screen pixels; null while it is closed. A right
   * click sets it. Set it to open the menu from code, set it to null to close
   * it: `bind:menuAt`.
   */
  menuAt?: ScreenPoint | null | undefined;

  /** False opens the menu's window without taking focus: for tests. Default true. */
  shouldActivateMenu?: boolean | undefined;
}
