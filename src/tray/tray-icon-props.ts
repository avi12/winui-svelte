import type { MenuItem, MenuProfile } from "./menu/types.ts";
import type { TrayIconHandle, TrayIconOptions } from "./tray-core.ts";
import type { ScreenPoint, TrayMenuContext } from "./tray-menu.ts";
import type { Snippet } from "svelte";

/**
 * The props of `TrayIcon`: the options of `createTrayIcon`, the menu, and the live handle to bind. `ItemId` is the
 * union of the ids of `menu` when it is a model, so that `profile` is checked against them.
 */
export interface TrayIconComponentProps<ItemId extends string = string> extends TrayIconOptions {
  /** `bind:handle` gives `notify`, `bounds` and `remove`. */
  handle?: TrayIconHandle | undefined;

  /**
   * The menu: a flyout (`MenuFlyout`, `CommandBarFlyout`, any `Flyout`)
   * written with `open`, or the lines of the shared menu model
   * (`winui-svelte/tray/menu`), which `TrayIcon` draws as a `MenuFlyout`. It
   * opens at the pointer on a right click, in a one-pixel window that exists
   * only while the menu is open.
   */
  menu?: Snippet<[TrayMenuContext]> | readonly MenuItem<ItemId>[] | undefined;

  /**
   * The user's choice of what a model menu (`menu={items}`) shows; a `TrayMenu` in the children has a `profile` of
   * its own.
   */
  profile?: MenuProfile<NoInfer<ItemId>> | undefined;

  /** A menu written as markup: a `TrayMenu` with its lines. It is read each time the menu opens. */
  children?: Snippet | undefined;

  /**
   * Where the menu is open, in screen pixels; null while it is closed. A right
   * click sets it. Set it to open the menu from code, set it to null to close
   * it: `bind:menuAt`.
   */
  menuAt?: ScreenPoint | null | undefined;

  /** False opens the menu's window without taking focus: for tests. Default true. */
  shouldActivateMenu?: boolean | undefined;
}
