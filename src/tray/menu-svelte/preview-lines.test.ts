import { previewLines } from "./preview-lines.ts";
import { defaultProfile } from "#src/tray/menu/profile.js";
import { MenuItemKind, MenuLevel } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const items = [
  {
    kind: MenuItemKind.COMMAND,
    id: "open",
    label: "Open"
  },
  {
    kind: MenuItemKind.SEPARATOR,
    id: "divider",
    level: MenuLevel.STANDARD
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "tools",
    label: "Tools",
    level: MenuLevel.STANDARD,
    items: [{
      kind: MenuItemKind.COMMAND,
      id: "ruler",
      label: "Ruler"
    }]
  },
  {
    kind: MenuItemKind.COMMAND,
    id: "exit",
    label: "Exit",
    isRequired: true
  }
] satisfies MenuItem[];

test("the preview is what the menu resolves to, a submenu's lines one deeper", () => {
  assert.deepEqual(
    previewLines({
      items,
      profile: defaultProfile()
    }).map(line => `${line.depth}:${line.text}`), ["0:Open", "0:Exit"]
  );
  assert.deepEqual(
    previewLines({
      items,
      profile: defaultProfile({ level: MenuLevel.STANDARD })
    }).map(line => `${line.depth}:${line.text}`), ["0:Open", "0:-----", "0:Tools", "1:Ruler", "0:Exit"]
  );
});
