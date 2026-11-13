import type { PictureSource } from "#src/picture-source.js";
import type { IconPixels } from "#src/win32-icons.js";

/** One picture for each menu theme; `forLightMenu` is the picture drawn on a light menu (so a dark glyph). */
export interface MenuIconPair {
  /** Drawn while the menu is light. */
  readonly forLightMenu: PictureSource<IconPixels>;

  /** Drawn while the menu is dark. */
  readonly forDarkMenu: PictureSource<IconPixels>;
}

/**
 * A single-color glyph that the menu paints in its own text color, so one picture serves both themes: only
 * the alpha channel of `tinted` is used.
 */
export interface MenuIconTinted {
  readonly tinted: PictureSource<IconPixels>;
}

/**
 * What a menu line's `icon` can be: a path to an `.ico` or `.png` (a glyph string on the renderers that draw
 * glyphs), square BGRA pixels (`IconPixels`), a `{ forLightMenu, forDarkMenu }` pair, or `{ tinted }` for a
 * monochrome glyph that takes the text color.
 */
export type MenuIcon = PictureSource<IconPixels | MenuIconPair | MenuIconTinted>;

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

/** A value, or a function that gives it each time the menu is resolved (when it opens). */
export type MenuValue<T> = T | (() => T);

/** What a renderer tells `onselect` when the user picks an item. */
export interface MenuSelectEvent<ItemId extends string = string> {
  /** The item as the app declared it. */
  readonly item: MenuItem<ItemId>;
}

interface MenuItemBase<ItemId extends string = string> {
  /** Unique in the whole menu and stable across versions of the app: the user's profile is keyed by it. */
  readonly id: ItemId;

  /** The lowest detail level that shows the item; `simple` when left out. */
  readonly level?: MenuLevel;

  /** True for an item the user cannot hide, such as Quit. */
  readonly isRequired?: boolean;
}

interface MenuLabelledItem<ItemId extends string = string> extends MenuItemBase<ItemId> {
  readonly label: MenuValue<string>;

  /** The picture beside the label; each renderer decides what it can draw. */
  readonly icon?: MenuIcon;

  /** Small trailing text, such as a count. */
  readonly badge?: MenuValue<string>;

  /** True unless set to false. */
  readonly isEnabled?: MenuValue<boolean>;

  /** False leaves the item out for this opening, whatever the profile says; true unless set to false. */
  readonly isVisible?: MenuValue<boolean>;

  /** True draws the label in bold, for example the item that is on. */
  readonly isBold?: MenuValue<boolean>;
}

interface MenuActionItem<ItemId extends string = string> extends MenuLabelledItem<ItemId> {
  /** Display text only, such as `Ctrl+Shift+4`; the menu does not bind the key. */
  readonly shortcut?: string;
  readonly onselect?: (event: MenuSelectEvent<ItemId>) => void;

  /**
   * True keeps the menu open after the pick (a check or radio toggled several times in one visit); the
   * renderer then refreshes only labels and ticks.
   */
  readonly staysOpen?: boolean;

  /**
   * True unless set to false: `onselect` runs after the menu has closed, on the next turn, so that a
   * dialog can open.
   */
  readonly closeThenRun?: boolean;
}

/** A line that runs `onselect`. */
export interface MenuCommandItem<ItemId extends string = string> extends MenuActionItem<ItemId> {
  readonly kind: typeof MenuItemKind.COMMAND;
}

/** A line with a tick that the app owns; the renderer shows `isChecked` and calls `onselect`. */
export interface MenuCheckItem<ItemId extends string = string> extends MenuActionItem<ItemId> {
  readonly kind: typeof MenuItemKind.CHECK;
  readonly isChecked?: MenuValue<boolean>;
}

/** One of a set of lines of which one is ticked; the items that share a `group` are the set. */
export interface MenuRadioItem<ItemId extends string = string> extends MenuActionItem<ItemId> {
  readonly kind: typeof MenuItemKind.RADIO;
  readonly group: string;
  readonly isChecked?: MenuValue<boolean>;
}

/** A line that opens more lines. */
export interface MenuSubmenuItem<ItemId extends string = string> extends MenuLabelledItem<ItemId> {
  readonly kind: typeof MenuItemKind.SUBMENU;

  /**
   * The children, or a function that makes them each time the menu is resolved, for a list that
   * changes (recent uploads).
   */
  readonly items: readonly MenuItem<ItemId>[] | (() => readonly MenuItem<ItemId>[]);

  /** Orders the children of a dynamic list before the cap; ignored for a fixed array. */
  readonly sort?: (left: MenuItem<ItemId>, right: MenuItem<ItemId>) => number;

  /** Keeps the first this many children of a dynamic list, after `sort`; ignored for a fixed array. */
  readonly maxItems?: number;

  /**
   * When the submenu would be empty: a disabled line with this text takes its place, instead of the
   * submenu being dropped (for example "No windows found").
   */
  readonly emptyLabel?: string;

  /** Runs when the row itself is picked, not only its children. */
  readonly onselect?: (event: MenuSelectEvent<ItemId>) => void;

  /** True opens the submenu when the menu appears. */
  readonly autoExpand?: boolean;

  /** As on a command. */
  readonly closeThenRun?: boolean;
}

/** A line between groups of items. */
export interface MenuSeparatorItem<ItemId extends string = string> extends MenuItemBase<ItemId> {
  readonly kind: typeof MenuItemKind.SEPARATOR;
}

/** A caption for the items under it. */
export interface MenuHeaderItem<ItemId extends string = string> extends MenuItemBase<ItemId> {
  readonly kind: typeof MenuItemKind.HEADER;
  readonly label: MenuValue<string>;
}

/** A line of a tray menu as the app declares it. */
export type MenuItem<ItemId extends string = string> =
  | MenuCommandItem<ItemId>
  | MenuCheckItem<ItemId>
  | MenuRadioItem<ItemId>
  | MenuSubmenuItem<ItemId>
  | MenuSeparatorItem<ItemId>
  | MenuHeaderItem<ItemId>;

/**
 * The user's choice of what the menu shows, plain JSON: a level, then single
 * items turned off or on, then the order.
 */
export interface MenuProfile<ItemId extends string = string> {
  readonly level: MenuLevel;

  /** Ids shown by the level that the user hid; never an item with `isRequired`. */
  readonly hidden: readonly ItemId[];

  /** Ids above the level that the user turned on. */
  readonly shown: readonly ItemId[];

  /** The ids of each menu in the user's order, keyed by the parent submenu's id, or `""` for the root. */
  readonly order: { readonly [Parent in ItemId | ""]?: readonly ItemId[] };
}

/** The id of a resolved line: a declared id, or the id of the placeholder a submenu shows for `emptyLabel`. */
export type ResolvedId<ItemId extends string = string> = ItemId | `${ItemId}.empty`;

interface ResolvedBase<ItemId extends string = string> {
  readonly id: ResolvedId<ItemId>;
}

interface ResolvedLabelled<ItemId extends string = string> extends ResolvedBase<ItemId> {
  readonly label: string;
  readonly icon?: MenuIcon;
  readonly badge?: string;
  readonly isEnabled: boolean;
  readonly isBold: boolean;
}

interface ResolvedAction<ItemId extends string = string> extends ResolvedLabelled<ItemId> {
  readonly shortcut?: string;
  readonly staysOpen: boolean;

  /** True when `select` is to run after the menu has closed. */
  readonly closeThenRun: boolean;

  /** Runs the item's `onselect`, if it has one; the renderer calls it at the time `closeThenRun` says. */
  readonly select: () => void;
}

/** A command a renderer draws. */
export interface ResolvedCommand<ItemId extends string = string> extends ResolvedAction<ItemId> {
  readonly kind: typeof MenuItemKind.COMMAND;
}

/** A tick line a renderer draws. */
export interface ResolvedCheck<ItemId extends string = string> extends ResolvedAction<ItemId> {
  readonly kind: typeof MenuItemKind.CHECK;
  readonly isChecked: boolean;
}

/** A radio line a renderer draws. */
export interface ResolvedRadio<ItemId extends string = string> extends ResolvedAction<ItemId> {
  readonly kind: typeof MenuItemKind.RADIO;
  readonly group: string;
  readonly isChecked: boolean;
}

/**
 * A submenu a renderer draws; it holds at least one line that is not a separator or a header (the
 * disabled `emptyLabel` line counts).
 */
export interface ResolvedSubmenu<ItemId extends string = string> extends ResolvedLabelled<ItemId> {
  readonly kind: typeof MenuItemKind.SUBMENU;
  readonly items: readonly ResolvedMenuItem<ItemId>[];
  readonly autoExpand: boolean;
  readonly closeThenRun: boolean;

  /** Runs the row's own `onselect`, if it has one. */
  readonly select: () => void;
}

/** A separator a renderer draws. */
export interface ResolvedSeparator<ItemId extends string = string> extends ResolvedBase<ItemId> {
  readonly kind: typeof MenuItemKind.SEPARATOR;
}

/** A header a renderer draws; it always has an item under it. */
export interface ResolvedHeader<ItemId extends string = string> extends ResolvedBase<ItemId> {
  readonly kind: typeof MenuItemKind.HEADER;
  readonly label: string;
}

/** A line of the menu to draw, after the profile is applied. */
export type ResolvedMenuItem<ItemId extends string = string> =
  | ResolvedCommand<ItemId>
  | ResolvedCheck<ItemId>
  | ResolvedRadio<ItemId>
  | ResolvedSubmenu<ItemId>
  | ResolvedSeparator<ItemId>
  | ResolvedHeader<ItemId>;

/** One row of the flat list an editor shows. */
export interface MenuItemDescription<ItemId extends string = string> {
  readonly id: ItemId;
  readonly kind: MenuItemKind;

  /** The label; empty for a separator. */
  readonly label: string;
  readonly level: MenuLevel;

  /** The id of the submenu that holds the item, or `""` for the root. */
  readonly parentId: ItemId | "";
  readonly isRequired: boolean;
}

/** The union of every id a declared menu holds, to type a profile for it. */
export type MenuIds<Items> = Items extends readonly MenuItem<infer ItemId>[] ? ItemId : never;
