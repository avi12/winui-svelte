import { menuIcons } from "./menu-icons.ts";
import { MenuColorScheme } from "./menu-theme.ts";
import { createMenuBuilder } from "./native.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { resolveMenu } from "#src/tray/menu/resolve.js";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";
import { pngBytesOf } from "#src/web-apis/png-writer.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import { bindDll, withMemory } from "#src/win32-calls.js";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// Real popup menu handles with icons, read back through user32 and gdi32: the bitmap of an item is a
// 32-bit DIB section of premultiplied pixels, sized for the screen, and freed with the menu.

const MIIM_BITMAP = 0x80;
const INFO_SIZE = 80;
const POINTER_BYTES = 8;
const OFFSET_MASK = 4;
const OFFSET_BITMAP = 72;
const BITMAP_BYTES = 32;
const OFFSET_BITS_PIXEL = 18;
const OFFSET_BITS = 24;
const SOURCE_SIZE = 8;

const { getInfo } = bindDll({
  dll: "user32.dll",
  functions: {
    getInfo: ["GetMenuItemInfoW", ["pointer", "u32", "i32", "pointer"], "i32"]
  }
});
const { guiObjects } = bindDll({
  dll: "user32.dll",
  functions: {
    guiObjects: ["GetGuiResources", ["pointer", "u32"], "u32"]
  }
});
const { currentProcess } = bindDll({
  dll: "kernel32.dll",
  functions: {
    currentProcess: ["GetCurrentProcess", [], "pointer"]
  }
});
const GDI_OBJECTS = 0;
const { getObject } = bindDll({
  dll: "gdi32.dll",
  functions: {
    getObject: ["GetObjectW", ["pointer", "i32", "pointer"], "i32"]
  }
});
const { copyMemory } = bindDll({
  dll: "kernel32.dll",
  functions: {
    copyMemory: ["RtlMoveMemory", ["pointer", "pointer", "i64"], "i32"]
  }
});

function bitmapAt({ menu, position }: {
  readonly menu: bigint;
  readonly position: number;
}) {
  return withMemory({
    size: INFO_SIZE,
    alignment: POINTER_BYTES,
    use(info) {
      info.writeU32(0, INFO_SIZE);
      info.writeU32(OFFSET_MASK, MIIM_BITMAP);
      getInfo(menu, position, 1, info);
      return info.readU64(OFFSET_BITMAP);
    }
  });
}

function pixelsOf(bitmap: bigint) {
  return withMemory({
    size: BITMAP_BYTES,
    alignment: POINTER_BYTES,
    use(info) {
      getObject(bitmap, BITMAP_BYTES, info);
      const width = info.readI32(4);
      const bits = info.readU64(OFFSET_BITS);
      const bytes = DynComRawMemory.allocate(width * width * 4, 4);
      try {
        copyMemory(bytes, bits, BigInt(width * width * 4));
        return {
          width,
          bitsPerPixel: info.readU16(OFFSET_BITS_PIXEL),
          bytes: bytes.readBytes(0, width * width * 4)
        };
      } finally {
        bytes.release();
      }
    }
  });
}

test("items and submenu items with a png icon get a premultiplied 32-bit bitmap, freed with the menu", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "menu-icons-"));
  try {
    const rgba = new Uint8ClampedArray(SOURCE_SIZE * SOURCE_SIZE * 4);
    for (let i = 0; i < rgba.length; i += 4) {
      rgba.set([200, 100, 50, 128], i);
    }

    const file = path.join(directory, "half.png");
    writeFileSync(file, pngBytesOf(new ImageData(rgba, SOURCE_SIZE, SOURCE_SIZE)));
    const items = [
      {
        kind: MenuItemKind.COMMAND,
        id: "plain",
        label: "Plain"
      },
      {
        kind: MenuItemKind.CHECK,
        id: "ticked",
        label: "Ticked",
        isChecked: true,
        icon: file
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "off",
        label: "Off",
        isEnabled: false,
        icon: {
          tinted: file
        }
      },
      {
        kind: MenuItemKind.SUBMENU,
        id: "more",
        label: "More",
        icon: {
          forLightMenu: file,
          forDarkMenu: file
        },
        items: [{
          kind: MenuItemKind.COMMAND,
          id: "leaf",
          label: "Leaf",
          icon: file
        }]
      },
      {
        kind: MenuItemKind.COMMAND,
        id: "missing",
        label: "Missing",
        icon: path.join(directory, "none.png")
      }
    ] satisfies MenuItem[];
    const builder = createMenuBuilder({ icons: menuIcons.createCalls() });
    const resolved = resolveMenu({ items });
    builder.build({
      items: resolved,
      isDark: true
    }).destroy();
    const objectsBefore = guiObjects(currentProcess(), GDI_OBJECTS);
    const built = builder.build({
      items: resolved,
      isDark: true
    });
    const { menu } = built;
    assert.equal(
      bitmapAt({
        menu,
        position: 0
      }), 0n, "no icon, no bitmap"
    );
    assert.equal(
      bitmapAt({
        menu,
        position: 4
      }), 0n, "an unreadable icon is left out"
    );

    const ticked = pixelsOf(
      bitmapAt({
        menu,
        position: 1
      })
    );
    assert.equal(ticked.bitsPerPixel, 32);
    assert.ok(ticked.width >= 15, `a menu bitmap is ${ticked.width} pixels`);
    const middle = (Math.floor(ticked.width / 2) * ticked.width + Math.floor(ticked.width / 2)) * 4;
    assert.deepEqual([...ticked.bytes.subarray(middle, middle + 4)], [25, 50, 100, 128], "premultiplied B G R A");

    const off = pixelsOf(
      bitmapAt({
        menu,
        position: 2
      })
    );
    const [blue, green, red, alpha] = off.bytes.subarray(middle, middle + 4);
    assert.ok((alpha ?? SOURCE_SIZE * SOURCE_SIZE * 4) < 128, "a disabled icon is fainter");
    assert.equal(blue, green);
    assert.equal(green, red);

    assert.notEqual(
      bitmapAt({
        menu,
        position: 3
      }), 0n, "a submenu row has its icon"
    );
    built.destroy();
    assert.equal(guiObjects(currentProcess(), GDI_OBJECTS), objectsBefore, "the bitmaps are freed with the menu");
  } finally {
    rmSync(directory, {
      recursive: true,
      force: true
    });
  }
});

test("without the menuIcons extra a line with an icon has no bitmap", () => {
  const built = createMenuBuilder().build({
    items: resolveMenu({
      items: [{
        kind: MenuItemKind.COMMAND,
        id: "a",
        label: "A",
        icon: "anything.png"
      }]
    }),
    isDark: false
  });
  try {
    assert.equal(
      bitmapAt({
        menu: built.menu,
        position: 0
      }), 0n
    );
  } finally {
    built.destroy();
  }
});

test("the dark decision follows a forced scheme and the system's app mode otherwise", () => {
  const calls = menuIcons.createCalls();
  assert.equal(calls.isDark(MenuColorScheme.DARK), true);
  assert.equal(calls.isDark(MenuColorScheme.LIGHT), false);
  assert.equal(typeof calls.isDark(MenuColorScheme.SYSTEM), "boolean");
});
