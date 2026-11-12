import { createMenuBuilder, menuTextOf } from "./native.ts";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import {
  bind,
  numberOf,
  pointerOf,
  WIDE_CHAR_BYTES,
  withMemory
} from "#src/win32-calls.js";
import assert from "node:assert/strict";
import { test } from "node:test";

// The real popup menu handles, built and read back, never shown: that
// TrackPopupMenuEx is modal and cannot be driven without input.

const MIIM_STATE = 0x1;
const MIIM_ID = 0x2;
const MIIM_SUBMENU = 0x4;
const MIIM_FTYPE = 0x100;
const MFT_SEPARATOR = 0x800;
const MFT_RADIOCHECK = 0x200;
const MFS_GRAYED = 0x3;
const MFS_CHECKED = 0x8;
const MFS_DEFAULT = 0x1000;
const MF_BYPOSITION = 0x400;
const INFO_SIZE = 80;
const POINTER_BYTES = 8;
const TEXT_UNITS = 64;
const OFFSET_MASK = 4;
const OFFSET_TYPE = 8;
const OFFSET_STATE = 12;
const OFFSET_ID = 16;
const OFFSET_SUBMENU = 24;

const getCount = bind({
  dll: "user32.dll",
  entryPoint: "GetMenuItemCount",
  parameters: ["pointer"],
  returnType: "i32"
});
const getInfo = bind({
  dll: "user32.dll",
  entryPoint: "GetMenuItemInfoW",
  parameters: ["pointer", "u32", "i32", "pointer"],
  returnType: "i32"
});
const getString = bind({
  dll: "user32.dll",
  entryPoint: "GetMenuStringW",
  parameters: ["pointer", "u32", "pointer", "i32", "u32"],
  returnType: "i32"
});
const isMenu = bind({
  dll: "user32.dll",
  entryPoint: "IsMenu",
  parameters: ["pointer"],
  returnType: "i32"
});

function read({ menu, position }: {
  readonly menu: bigint;
  readonly position: number;
}) {
  return withMemory({
    size: INFO_SIZE,
    alignment: POINTER_BYTES,
    use(info) {
      info.writeU32(0, INFO_SIZE);
      info.writeU32(OFFSET_MASK, MIIM_FTYPE | MIIM_STATE | MIIM_ID | MIIM_SUBMENU);
      getInfo.invoke([DynWin32Unsafe.pointer(menu), DynWin32.u32(position), DynWin32.i32(1), pointerOf(info)]);
      return {
        type: info.readU32(OFFSET_TYPE),
        state: info.readU32(OFFSET_STATE),
        id: info.readU32(OFFSET_ID),
        submenu: info.readU64(OFFSET_SUBMENU)
      };
    }
  });
}

function textOf({ menu, position }: {
  readonly menu: bigint;
  readonly position: number;
}) {
  return withMemory({
    size: TEXT_UNITS * WIDE_CHAR_BYTES,
    alignment: WIDE_CHAR_BYTES,
    use(buffer) {
      const length = numberOf(
        getString.invoke([
          DynWin32Unsafe.pointer(menu),
          DynWin32.u32(position),
          pointerOf(buffer),
          DynWin32.i32(TEXT_UNITS),
          DynWin32.u32(MF_BYPOSITION)
        ]).returnValue
      );
      return buffer.readBytes(0, length * WIDE_CHAR_BYTES).toString("utf16le");
    }
  });
}

function countOf(menu: bigint) {
  return numberOf(getCount.invoke([DynWin32Unsafe.pointer(menu)]).returnValue);
}

const ITEMS = [
  {
    kind: MenuItemKind.HEADER,
    id: "head",
    label: "Capture"
  },
  {
    kind: MenuItemKind.COMMAND,
    id: "open",
    label: "Open & go",
    shortcut: "Ctrl+O",
    badge: "3"
  },
  {
    kind: MenuItemKind.CHECK,
    id: "mute",
    label: "Mute",
    isChecked: true
  },
  {
    kind: MenuItemKind.RADIO,
    id: "fast",
    label: "Fast",
    group: "speed",
    isChecked: true
  },
  {
    kind: MenuItemKind.COMMAND,
    id: "off",
    label: "Off",
    isEnabled: false
  },
  {
    kind: MenuItemKind.SEPARATOR,
    id: "line"
  },
  {
    kind: MenuItemKind.SUBMENU,
    id: "more",
    label: "More",
    items: [{
      kind: MenuItemKind.SUBMENU,
      id: "deeper",
      label: "Deeper",
      items: [{
        kind: MenuItemKind.COMMAND,
        id: "leaf",
        label: "Leaf"
      }]
    }]
  }
] satisfies MenuItem[];

test("a resolved menu becomes real popup menu handles that read back as declared", () => {
  const built = createMenuBuilder().build({
    items: resolveMenu({ items: ITEMS }),
    isDark: false
  });
  try {
    const { menu } = built;
    assert.equal(countOf(menu), 7);

    const header = read({
      menu,
      position: 0
    });
    assert.equal(header.state & MFS_GRAYED, MFS_GRAYED, "a header is disabled");
    assert.equal(header.state & MFS_DEFAULT, MFS_DEFAULT, "and bold");

    assert.equal(
      textOf({
        menu,
        position: 1
      }), "Open && go  3\tCtrl+O"
    );
    const open = read({
      menu,
      position: 1
    });
    assert.equal(built.choices.get(open.id)?.id, "open", "the command number maps back to its item");

    const mute = read({
      menu,
      position: 2
    });
    assert.equal(mute.state & MFS_CHECKED, MFS_CHECKED);
    assert.equal(mute.type & MFT_RADIOCHECK, 0);

    const fast = read({
      menu,
      position: 3
    });
    assert.equal(fast.state & MFS_CHECKED, MFS_CHECKED);
    assert.equal(fast.type & MFT_RADIOCHECK, MFT_RADIOCHECK);

    const off = read({
      menu,
      position: 4
    });
    assert.equal(off.state & MFS_GRAYED, MFS_GRAYED);
    assert.equal(built.choices.get(off.id)?.id, "off");

    const line = read({
      menu,
      position: 5
    });
    assert.equal(line.type & MFT_SEPARATOR, MFT_SEPARATOR);

    const more = read({
      menu,
      position: 6
    });
    assert.notEqual(more.submenu, 0n);
    assert.equal(countOf(more.submenu), 1);
    const deeper = read({
      menu: more.submenu,
      position: 0
    });
    assert.notEqual(deeper.submenu, 0n);
    const leaf = read({
      menu: deeper.submenu,
      position: 0
    });
    assert.equal(built.choices.get(leaf.id)?.id, "leaf");
    assert.deepEqual([...built.choices.values()].map(choice => choice.id), ["open", "mute", "fast", "off", "leaf"]);

    built.destroy();
    assert.equal(numberOf(isMenu.invoke([DynWin32Unsafe.pointer(menu)]).returnValue), 0, "destroyed");
    assert.equal(numberOf(isMenu.invoke([DynWin32Unsafe.pointer(deeper.submenu)]).returnValue), 0, "with its submenus");
  } finally {
    built.destroy();
  }
});

test("the text of a line doubles the ampersands, then the badge, then the shortcut after a tab", () => {
  const [line] = resolveMenu({
    items: [{
      kind: MenuItemKind.COMMAND,
      id: "a",
      label: "A&B",
      badge: "x&y",
      shortcut: "F1"
    }]
  });
  assert.equal(line && line.kind !== MenuItemKind.SEPARATOR && menuTextOf(line), "A&&B  x&&y\tF1");
});
