/** The kinds of item `chrome.contextMenus` knows. */
export const ContextItemType = {
  NORMAL: "normal",
  CHECKBOX: "checkbox",
  RADIO: "radio",
  SEPARATOR: "separator"
} as const;

/** One of `ContextItemType`'s values. */
export type ContextItemType = typeof ContextItemType[keyof typeof ContextItemType];

/** The places an item may ask to appear, with Chrome's names. */
export const ContextType = {
  ALL: "all",
  PAGE: "page",
  FRAME: "frame",
  SELECTION: "selection",
  LINK: "link",
  EDITABLE: "editable",
  IMAGE: "image",
  VIDEO: "video",
  AUDIO: "audio",
  LAUNCHER: "launcher",
  BROWSER_ACTION: "browser_action",
  PAGE_ACTION: "page_action",
  ACTION: "action"
} as const;

/** One of `ContextType`'s values. */
export type ContextType = typeof ContextType[keyof typeof ContextType];

/** The native menus an app has: the tray icon's menu, and the context flyout of a window. */
export const ContextMenuSurface = {
  TRAY: "tray",
  WINDOW: "window"
} as const;

/** One of `ContextMenuSurface`'s values. */
export type ContextMenuSurface = typeof ContextMenuSurface[keyof typeof ContextMenuSurface];

/** What `onClicked` tells about the pick. */
export interface OnClickData {
  /** The id of the item that was picked. */
  readonly menuItemId: string;

  /** The id of the submenu that holds the item, when it has one. */
  readonly parentMenuItemId?: string;

  /** The state of a checkbox or radio after the pick. */
  readonly checked?: boolean;

  /** The state of a checkbox or radio before the pick. */
  readonly wasChecked?: boolean;

  /** Always false; a native menu has no editable field under it. */
  readonly editable: boolean;
}

/** What `create` takes; the properties of Chrome's `CreateProperties`. */
export interface CreateProperties {
  /** Unique among the items; made up when left out. */
  readonly id?: string | undefined;

  /** `normal` when left out. */
  readonly type?: ContextItemType | undefined;

  /** The text; required unless the item is a separator. */
  readonly title?: string | undefined;
  readonly checked?: boolean | undefined;

  /** Where the item appears; `page` when left out. */
  readonly contexts?: readonly ContextType[] | undefined;

  /** True unless set to false. */
  readonly visible?: boolean | undefined;

  /** True unless set to false. */
  readonly enabled?: boolean | undefined;

  /** The id of the item to nest under, which must exist. */
  readonly parentId?: string | number | undefined;

  /** Runs when the item is picked, before `onClicked` fires. */
  readonly onclick?: ((info: OnClickData) => void) | undefined;

  /** Accepted and ignored; a native menu has no page address. */
  readonly documentUrlPatterns?: readonly string[] | undefined;

  /** Accepted and ignored; a native menu has no link address. */
  readonly targetUrlPatterns?: readonly string[] | undefined;
}

/** What `update` takes: `CreateProperties` without the id. */
export type UpdateProperties = Omit<CreateProperties, "id">;
