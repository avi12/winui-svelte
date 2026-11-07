import { defineMenu, MenuItemKind, MenuLevel } from "winui-svelte/tray/menu";
import type { MenuIds } from "winui-svelte/tray/menu";
import { exitApplication } from "winui-svelte/window";

// A ShareX-like menu in three levels. At `simple` it is three lines, as a
// dictation app keeps; `standard` adds the submenus most people use, `full`
// everything else.

const RECENT_UPLOADS = ["screenshot-1.png", "notes.txt", "clip.mp4"];
let isLinkCopied = true;

export const items = defineMenu([
  {
    kind: MenuItemKind.COMMAND,
    id: "capture-region",
    label: "Capture region",
    shortcut: "Ctrl+Shift+4",
    isBold: true
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "capture",
    label: "Capture",
    level: MenuLevel.STANDARD,
    items: [
      {
        kind: MenuItemKind.COMMAND,
        id: "capture-screen",
        label: "Full screen",
        level: MenuLevel.STANDARD
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "capture-window",
        label: "Active window",
        level: MenuLevel.STANDARD
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "capture-scrolling",
        label: "Scrolling capture",
        level: MenuLevel.FULL
      }
    ]
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "upload",
    label: "Upload",
    level: MenuLevel.STANDARD,
    items: [
      {
        kind: MenuItemKind.COMMAND,
        id: "upload-file",
        label: "Upload file",
        level: MenuLevel.STANDARD
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "upload-clipboard",
        label: "Upload from clipboard",
        level: MenuLevel.STANDARD
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "upload-url",
        label: "Upload from URL",
        level: MenuLevel.FULL
      }
    ]
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "tools",
    label: "Tools",
    level: MenuLevel.FULL,
    items: [
      {
        kind: MenuItemKind.COMMAND,
        id: "tool-color-picker",
        label: "Color picker",
        level: MenuLevel.FULL
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "tool-ruler",
        label: "Ruler",
        level: MenuLevel.FULL
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "tool-hash",
        label: "Hash check",
        level: MenuLevel.FULL
      }
    ]
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "recent",
    label: "Recent uploads",
    level: MenuLevel.STANDARD,
    emptyLabel: "No uploads yet",
    maxItems: 5,
    items: () => RECENT_UPLOADS.map(name => ({
      kind: MenuItemKind.COMMAND,
      id: `recent-${name}`,
      label: name,
      level: MenuLevel.STANDARD
    }))
  },
  {
    kind: MenuItemKind.SEPARATOR,
    id: "divider",
    level: MenuLevel.STANDARD
  },
  {
    kind: MenuItemKind.CHECK,
    id: "copy-link",
    label: "Copy link after upload",
    level: MenuLevel.STANDARD,
    isChecked: () => isLinkCopied,
    staysOpen: true,
    onselect() {
      isLinkCopied = !isLinkCopied;
    }
  },
  {
    kind: MenuItemKind.COMMAND,
    id: "settings",
    label: "Settings"
  },
  {
    kind: MenuItemKind.COMMAND,
    id: "exit",
    label: "Exit",
    isRequired: true,
    onselect: exitApplication
  }
]);

export type MenuId = MenuIds<typeof items>;
