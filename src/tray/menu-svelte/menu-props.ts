import type {
  MenuCheckItem,
  MenuCommandItem,
  MenuHeaderItem,
  MenuItemKind,
  MenuProfile,
  MenuRadioItem,
  MenuSeparatorItem,
  MenuSubmenuItem
} from "#src/tray/menu/types.js";
import type { Snippet } from "svelte";

// The props of the markup components are the model's own members: an item's
// fields come from MenuCommandItem and its kin, so a field added to the model
// reaches the markup, and the ids are plain strings because markup cannot
// carry a literal union.

type Fields<Item extends { readonly kind: MenuItemKind }> = Omit<Item, "kind">;

/**
 * The props of `TrayMenuItem`: a command unless `kind` says `"check"` or `"radio"`, which then also take their tick.
 * The `never` members keep a tick off a command and a group off a check, which a union without a `kind` would accept.
 */
export type TrayMenuItemProps =
  | (Fields<MenuCommandItem> & {
    readonly kind?: typeof MenuItemKind.COMMAND;
    readonly isChecked?: never;
    readonly group?: never;
  })
  | (Fields<MenuCheckItem> & {
    readonly kind: typeof MenuItemKind.CHECK;
    readonly group?: never;
  })
  | (Fields<MenuRadioItem> & { readonly kind: typeof MenuItemKind.RADIO });

/** The props of `TrayMenuSubmenu`: the submenu's fields, and its children as markup (a `{#each}` makes a list). */
export type TrayMenuSubmenuProps = Fields<Omit<MenuSubmenuItem, "items" | "sort" | "maxItems">> & {
  readonly children: Snippet;
};

/** The props of `TrayMenuSeparator`. */
export type TrayMenuSeparatorProps = Fields<MenuSeparatorItem>;

/** The props of `TrayMenuHeader`. */
export type TrayMenuHeaderProps = Fields<MenuHeaderItem>;

/** The props of `TrayMenu`: the markup of the menu, and the user's profile for it. */
export interface TrayMenuProps {
  /** The user's choice of what the menu shows; a `profile` on `TrayIcon` is used when this is left out. */
  readonly profile?: MenuProfile;
  readonly children?: Snippet;
}
