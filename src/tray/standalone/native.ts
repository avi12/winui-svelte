import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { ResolvedCheck, ResolvedCommand, ResolvedMenuItem, ResolvedRadio } from "#src/tray/menu/types.js";
import type { MenuIconCalls } from "#src/tray/tray-extras.js";
import { bindDll, wideMemory } from "#src/win32-calls.js";

const MIIM_STATE = 0x1;
const MIIM_ID = 0x2;
const MIIM_SUBMENU = 0x4;
const MIIM_STRING = 0x40;
const MIIM_BITMAP = 0x80;
const MIIM_FTYPE = 0x100;
const MFT_SEPARATOR = 0x800;
const MFT_RADIOCHECK = 0x200;
const MFS_GRAYED = 0x3;
const MFS_CHECKED = 0x8;
const MFS_DEFAULT = 0x1000;
const MENU_ITEM_INFO_SIZE = 80;
const POINTER_BYTES = 8;
const OFFSET_MASK = 4;
const OFFSET_TYPE = 8;
const OFFSET_STATE = 12;
const OFFSET_ID = 16;
const OFFSET_SUBMENU = 24;
const OFFSET_TEXT = 56;
const OFFSET_BITMAP = 72;
const BY_POSITION = 1;
const FIRST_COMMAND_ID = 1;
const TPM_RIGHTBUTTON = 0x2;
const TPM_BOTTOMALIGN = 0x20;
const TPM_NONOTIFY = 0x80;
const TPM_RETURNCMD = 0x100;
const WM_NULL = 0;
const NO_SUBMENU = 0n;
const NO_BITMAP = 0n;
const TAB_CODE = 9;
const SHORTCUT_SEPARATOR = String.fromCodePoint(TAB_CODE);

/** A line the user can pick in a native menu: a command, a check or a radio. */
export type NativeChoice = ResolvedCommand | ResolvedCheck | ResolvedRadio;

interface IconTheme {
  readonly isDark: boolean;
  readonly size: number;
  readonly bitmaps: bigint[];
}

type TextLine = Exclude<ResolvedMenuItem, { readonly kind: typeof MenuItemKind.SEPARATOR }>;

/**
 * The popup menu of Windows (`TrackPopupMenuEx`), behind one interface so the
 * tray's logic is pure and a test drives it with a fake. It needs no WinUI
 * and no window of the app, only a hidden window to own it.
 */
export interface NativeMenu {
  /**
   * Shows the menu at `point` and waits until it closes (it runs its own
   * message loop; the calling thread is busy meanwhile).
   *
   * @returns The line the user picked, or undefined when none.
   */
  choose(options: {
    readonly owner: bigint;
    readonly point: {
      readonly x: number;
      readonly y: number;
    };
    readonly items: readonly ResolvedMenuItem[];

    /** Whether the menu is dark now, which picks the member of an icon pair and the color of a tinted glyph. */
    readonly isDark: boolean;
  }): NativeChoice | undefined;
}

function escaped(text: string) {
  return text.replaceAll("&", "&&");
}

/**
 * The text Windows draws for a line: the label, the badge after it, and the
 * shortcut right-aligned (after a tab).
 *
 * @param item - A resolved line with a label.
 * @returns The text, with `&` doubled so that it is not read as a mnemonic.
 */
export function menuTextOf(item: TextLine) {
  const hasBadge = "badge" in item && item.badge;
  const hasShortcut = "shortcut" in item && item.shortcut;
  const badge = hasBadge ? `  ${escaped(item.badge)}` : "";
  const shortcut = hasShortcut ? `${SHORTCUT_SEPARATOR}${escaped(item.shortcut)}` : "";
  return `${escaped(item.label)}${badge}${shortcut}`;
}

function isChoice(item: ResolvedMenuItem): item is NativeChoice {
  return item.kind === MenuItemKind.COMMAND || item.kind === MenuItemKind.CHECK || item.kind === MenuItemKind.RADIO;
}

function stateOf(item: ResolvedMenuItem) {
  const isHeader = item.kind === MenuItemKind.HEADER;
  const isDisabled = isHeader || "isEnabled" in item && !item.isEnabled;
  const isChecked = "isChecked" in item && item.isChecked;
  const isDefault = isHeader || "isBold" in item && item.isBold;
  return (isDisabled ? MFS_GRAYED : 0) | (isChecked ? MFS_CHECKED : 0) | (isDefault ? MFS_DEFAULT : 0);
}

function typeOf(item: ResolvedMenuItem) {
  const isSeparator = item.kind === MenuItemKind.SEPARATOR;
  return (isSeparator ? MFT_SEPARATOR : 0) | (item.kind === MenuItemKind.RADIO ? MFT_RADIOCHECK : 0);
}

/**
 * The Win32 calls that make a menu from resolved lines, bound when this is called, never when the module loads.
 *
 * @param options - `icons`: the calls of the `menuIcons` extra; without them no line has an icon.
 */
export function createMenuBuilder({ icons }: { readonly icons?: MenuIconCalls | undefined } = {}) {
  const { createPopup, destroyMenu, insertItem } = bindDll({
    dll: "user32.dll",
    functions: {
      createPopup: ["CreatePopupMenu", [], "pointer"],
      destroyMenu: ["DestroyMenu", ["pointer"], "i32"],
      insertItem: ["InsertMenuItemW", ["pointer", "u32", "i32", "pointer"], "i32"]
    }
  });

  function fill({ menu, items, choices, theme }: {
    readonly menu: bigint;
    readonly items: readonly ResolvedMenuItem[];
    readonly choices: Map<number, NativeChoice>;
    readonly theme: IconTheme;
  }) {
    for (const [position, item] of items.entries()) {
      const isSubmenu = item.kind === MenuItemKind.SUBMENU;
      const submenu = isSubmenu ? createPopup() : NO_SUBMENU;
      if (isSubmenu) {
        fill({
          menu: submenu,
          items: item.items,
          choices,
          theme
        });
      }

      const isPick = isChoice(item);
      const id = isPick ? FIRST_COMMAND_ID + choices.size : 0;
      if (isPick) {
        choices.set(id, item);
      }

      const bitmap = bitmapOfItem({
        item,
        theme
      });
      const hasBitmap = bitmap !== NO_BITMAP;
      if (hasBitmap) {
        theme.bitmaps.push(bitmap);
      }

      const text = wideMemory(item.kind === MenuItemKind.SEPARATOR ? "" : menuTextOf(item));
      const info = DynComRawMemory.allocate(MENU_ITEM_INFO_SIZE, POINTER_BYTES);
      try {
        info.writeU32(0, MENU_ITEM_INFO_SIZE);
        info.writeU32(OFFSET_MASK, MIIM_FTYPE | MIIM_STATE | MIIM_ID | MIIM_SUBMENU | MIIM_STRING | MIIM_BITMAP);
        info.writeU64(OFFSET_BITMAP, bitmap);
        info.writeU32(OFFSET_TYPE, typeOf(item));
        info.writeU32(OFFSET_STATE, stateOf(item));
        info.writeU32(OFFSET_ID, id);
        info.writeU64(OFFSET_SUBMENU, submenu);
        info.writeU64(OFFSET_TEXT, text.pointer().address);
        insertItem(menu, position, BY_POSITION, info);
      } finally {
        info.release();
        text.release();
      }
    }
  }

  function bitmapOfItem({ item, theme }: {
    readonly item: ResolvedMenuItem;
    readonly theme: IconTheme;
  }) {
    const icon = "icon" in item ? item.icon : undefined;
    const hasIcon = icon !== undefined && icons !== undefined;
    if (!hasIcon) {
      return NO_BITMAP;
    }

    return icons.bitmapOf({
      icon,
      isDark: theme.isDark,
      isEnabled: "isEnabled" in item && item.isEnabled,
      isChecked: "isChecked" in item && item.isChecked,
      size: theme.size
    });
  }

  return {
    /**
     * Makes a popup menu, with a submenu for each submenu line to any depth. A line with an `icon` gets
     * a bitmap beside its label, sized for the screen scale and dimmed when the line is disabled.
     *
     * @returns The menu handle, the table from command number to line, and `destroy`, which
     * frees the menu, its submenus and the bitmaps.
     */
    build({ items, isDark }: {
      readonly items: readonly ResolvedMenuItem[];
      readonly isDark: boolean;
    }) {
      const menu = createPopup();
      const choices = new Map<number, NativeChoice>();
      const theme: IconTheme = {
        isDark,
        size: icons?.size() ?? 0,
        bitmaps: []
      };
      function destroy() {
        destroyMenu(menu);
        for (const bitmap of theme.bitmaps) {
          icons?.free(bitmap);
        }
      }

      try {
        fill({
          menu,
          items,
          choices,
          theme
        });
      } catch (error) {
        destroy();
        throw error;
      }

      return {
        menu,
        choices,
        destroy
      };
    }
  };
}

/**
 * The real popup menu. Its Win32 functions are bound when this is called, never when the module
 * loads. It does not theme itself: the menu follows the process's preferred app mode, which the
 * caller sets before `choose` (see `createMenuTheme`).
 */
export function createNativeMenu({ icons }: { readonly icons?: MenuIconCalls | undefined } = {}) {
  const builder = createMenuBuilder({ icons });
  const { trackPopup, postMessage } = bindDll({
    dll: "user32.dll",
    functions: {
      trackPopup: ["TrackPopupMenuEx", ["pointer", "u32", "i32", "i32", "pointer", "pointer"], "i32"],
      postMessage: ["PostMessageW", ["pointer", "u32", "pointer", "pointer"], "i32"]
    }
  });

  const native: NativeMenu = {
    choose({ owner, point, items, isDark }) {
      const built = builder.build({
        items,
        isDark
      });
      try {
        const chosen = trackPopup(
          built.menu,
          TPM_RETURNCMD | TPM_NONOTIFY | TPM_RIGHTBUTTON | TPM_BOTTOMALIGN,
          point.x,
          point.y,
          owner,
          null
        );
        postMessage(owner, WM_NULL, null, null);
        return built.choices.get(chosen);
      } finally {
        built.destroy();
      }
    }
  };
  return native;
}
