/** The kinds of line a tray menu holds. */
export const MenuItemKind = {
  COMMAND: "command",
  CHECK: "check",
  RADIO: "radio",
  SUBMENU: "submenu",
  SEPARATOR: "separator",
  HEADER: "header"
} as const;

/** One of `MenuItemKind`'s values. */
export type MenuItemKind = typeof MenuItemKind[keyof typeof MenuItemKind];

/**
 * How much of a menu is shown, from the fewest items to every item; a level
 * shows every item whose own level is at or below it.
 */
export const MenuLevel = {
  SIMPLE: "simple",
  STANDARD: "standard",
  FULL: "full"
} as const;

/** One of `MenuLevel`'s values. */
export type MenuLevel = typeof MenuLevel[keyof typeof MenuLevel];

/** What a renderer tells `onselect` when the user picks an item. */
export interface MenuSelectEvent {
  /** The item as the app declared it. */
  readonly item: MenuItem;
}

interface MenuItemBase {
  /** Unique in the whole menu and stable across versions of the app: the user's profile is keyed by it. */
  readonly id: string;

  /** The lowest detail level that shows the item; `simple` when left out. */
  readonly level?: MenuLevel;

  /** True for an item the user cannot hide, such as Quit. */
  readonly isRequired?: boolean;
}

interface MenuLabelledItem extends MenuItemBase {
  readonly label: string;

  /** A path to an `.ico` or `.png`, or a glyph string; each renderer decides what it can draw. */
  readonly icon?: string;

  /** True unless set to false. */
  readonly isEnabled?: boolean;
}

interface MenuActionItem extends MenuLabelledItem {
  /** Display text only, such as `Ctrl+Shift+4`; the menu does not bind the key. */
  readonly shortcut?: string;
  readonly onselect?: (event: MenuSelectEvent) => void;
}

/** A line that runs `onselect`. */
export interface MenuCommandItem extends MenuActionItem {
  readonly kind: typeof MenuItemKind.COMMAND;
}

/** A line with a tick that the app owns; the renderer shows `isChecked` and calls `onselect`. */
export interface MenuCheckItem extends MenuActionItem {
  readonly kind: typeof MenuItemKind.CHECK;
  readonly isChecked?: boolean;
}

/** One of a set of lines of which one is ticked; the items that share a `group` are the set. */
export interface MenuRadioItem extends MenuActionItem {
  readonly kind: typeof MenuItemKind.RADIO;
  readonly group: string;
  readonly isChecked?: boolean;
}

/** A line that opens more lines. */
export interface MenuSubmenuItem extends MenuLabelledItem {
  readonly kind: typeof MenuItemKind.SUBMENU;

  /** The children, or a function that makes them each time the menu opens, for a list that changes (recent uploads). */
  readonly items: readonly MenuItem[] | (() => readonly MenuItem[]);
}

/** A line between groups of items. */
export interface MenuSeparatorItem extends MenuItemBase {
  readonly kind: typeof MenuItemKind.SEPARATOR;
}

/** A caption for the items under it. */
export interface MenuHeaderItem extends MenuItemBase {
  readonly kind: typeof MenuItemKind.HEADER;
  readonly label: string;
}

/** A line of a tray menu as the app declares it. */
export type MenuItem =
  | MenuCommandItem
  | MenuCheckItem
  | MenuRadioItem
  | MenuSubmenuItem
  | MenuSeparatorItem
  | MenuHeaderItem;

/**
 * The user's choice of what the menu shows, plain JSON: a level, then single
 * items turned off or on, then the order.
 */
export interface MenuProfile {
  readonly level: MenuLevel;

  /** Ids shown by the level that the user hid; never an item with `isRequired`. */
  readonly hidden: readonly string[];

  /** Ids above the level that the user turned on. */
  readonly shown: readonly string[];

  /** The ids of each menu in the user's order, keyed by the parent submenu's id, or `""` for the root. */
  readonly order: Readonly<Record<string, readonly string[]>>;
}

interface ResolvedBase {
  readonly id: string;
}

interface ResolvedAction extends ResolvedBase {
  readonly label: string;
  readonly icon?: string;
  readonly shortcut?: string;
  readonly isEnabled: boolean;

  /** Runs the item's `onselect`, if it has one. */
  readonly select: () => void;
}

/** A command a renderer draws. */
export interface ResolvedCommand extends ResolvedAction {
  readonly kind: typeof MenuItemKind.COMMAND;
}

/** A tick line a renderer draws. */
export interface ResolvedCheck extends ResolvedAction {
  readonly kind: typeof MenuItemKind.CHECK;
  readonly isChecked: boolean;
}

/** A radio line a renderer draws. */
export interface ResolvedRadio extends ResolvedAction {
  readonly kind: typeof MenuItemKind.RADIO;
  readonly group: string;
  readonly isChecked: boolean;
}

/** A submenu a renderer draws; it always holds at least one line that is not a separator or a header. */
export interface ResolvedSubmenu extends ResolvedBase {
  readonly kind: typeof MenuItemKind.SUBMENU;
  readonly label: string;
  readonly icon?: string;
  readonly isEnabled: boolean;
  readonly items: readonly ResolvedMenuItem[];
}

/** A separator a renderer draws. */
export interface ResolvedSeparator extends ResolvedBase {
  readonly kind: typeof MenuItemKind.SEPARATOR;
}

/** A header a renderer draws; it always has an item under it. */
export interface ResolvedHeader extends ResolvedBase {
  readonly kind: typeof MenuItemKind.HEADER;
  readonly label: string;
}

/** A line of the menu to draw, after the profile is applied. */
export type ResolvedMenuItem =
  | ResolvedCommand
  | ResolvedCheck
  | ResolvedRadio
  | ResolvedSubmenu
  | ResolvedSeparator
  | ResolvedHeader;

/** One row of the flat list an editor shows. */
export interface MenuItemDescription {
  readonly id: string;
  readonly kind: MenuItemKind;

  /** The label; empty for a separator. */
  readonly label: string;
  readonly level: MenuLevel;

  /** The id of the submenu that holds the item, or `""` for the root. */
  readonly parentId: string;
  readonly isRequired: boolean;
}
