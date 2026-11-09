import {
  dimmedRaster,
  DISABLED_ALPHA,
  framedSquare,
  premultipliedSquare,
  rasterOf,
  tintedRaster
} from "./icon-raster.ts";
import type { Raster } from "./icon-raster.ts";
import { MenuColorScheme } from "./menu-theme.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { pictureOf } from "#src/tray/menu/icon.js";
import type { MenuIcon } from "#src/tray/menu/types.js";
import { createLightReader, PersonalizeValue } from "#src/tray/personalize.js";
import type { MenuIconCalls, MenuIconsExtra } from "#src/tray/tray-extras.js";
import { bindDll, wideMemory, withMemory } from "#src/win32-calls.js";
import { BYTES_PER_PIXEL } from "#src/win32-icons.js";
import { statSync } from "node:fs";
import path from "node:path";

// The bitmaps a popup menu item draws beside its label (MIIM_BITMAP). Windows draws an item's bitmap
// with alpha only when it is a 32-bit DIB section of premultiplied pixels, at the size of the menu's
// check mark at the screen's scale; it does not dim the bitmap of a disabled item, so that is done here.

const SM_CXMENUCHECK = 71;
const SM_CXSMICON = 49;
const DIB_RGB_COLORS = 0;
const BITS_PER_PIXEL = 32;
const HEADER_BYTES = 40;
const INFO_BYTES = 44;
const POINTER_BYTES = 8;
const OFFSET_WIDTH = 4;
const OFFSET_HEIGHT = 8;
const OFFSET_PLANES = 12;
const OFFSET_BIT_COUNT = 14;
const GDIP_OK = 0;
const GDIP_STARTUP_INPUT_BYTES = 24;
const GDIP_LOCK_READ = 1;
const GDIP_FORMAT_32BPP_ARGB = 0x26200A;
const RECT_BYTES = 16;
const OFFSET_RECT_WIDTH = 8;
const OFFSET_RECT_HEIGHT = 12;
const BITMAP_DATA_BYTES = 32;
const OFFSET_STRIDE = 8;
const OFFSET_SCAN0 = 16;
const NO_BITMAP = 0n;
const TICK_ALPHA = 0.8;
const DARK_TEXT_RGB = 0xFFFFFF;
const LIGHT_TEXT_RGB = 0x1B1B1B;

/**
 * The menu's text color, which a tinted glyph takes.
 *
 * @param isDark - Whether the menu is dark.
 * @returns The color as 0xRRGGBB.
 */
function menuTextRgb(isDark: boolean) {
  return isDark ? DARK_TEXT_RGB : LIGHT_TEXT_RGB;
}

function fileKeyOf(file: string) {
  const resolved = path.resolve(file);
  const stat = statSync(resolved, { throwIfNoEntry: false });
  return stat?.isFile() ? `${resolved}|${stat.mtimeMs}` : undefined;
}

/**
 * The Win32 calls that decode a picture file and make a menu bitmap of pixels, bound when this is
 * called. Files are decoded by GDI+ (png, ico, bmp, jpeg, gif and tiff, with no dependency of the
 * package) and kept by path and modification time, so a menu that opens again does not decode again.
 */
function createMenuIconCalls() {
  const { dpi, metrics } = bindDll({
    dll: "user32.dll",
    functions: {
      dpi: ["GetDpiForSystem", [], "u32"],
      metrics: ["GetSystemMetricsForDpi", ["i32", "u32"], "i32"]
    }
  });
  const { createSection, deleteObject } = bindDll({
    dll: "gdi32.dll",
    functions: {
      createSection: ["CreateDIBSection", ["pointer", "pointer", "u32", "pointer", "pointer", "u32"], "pointer"],
      deleteObject: ["DeleteObject", ["pointer"], "i32"]
    }
  });
  const { copyMemory } = bindDll({
    dll: "kernel32.dll",
    functions: {
      copyMemory: ["RtlMoveMemory", ["pointer", "pointer", "i64"], "i32"]
    }
  });
  const gdiplus = bindDll({
    dll: "gdiplus.dll",
    functions: {
      startup: ["GdiplusStartup", ["pointer", "pointer", "pointer"], "i32"],
      shutdown: ["GdiplusShutdown", ["pointer"], "i32"],
      fromFile: ["GdipCreateBitmapFromFile", ["pointer", "pointer"], "i32"],
      imageWidth: ["GdipGetImageWidth", ["pointer", "pointer"], "i32"],
      imageHeight: ["GdipGetImageHeight", ["pointer", "pointer"], "i32"],
      lockBits: ["GdipBitmapLockBits", ["pointer", "pointer", "u32", "i32", "pointer"], "i32"],
      unlockBits: ["GdipBitmapUnlockBits", ["pointer", "pointer"], "i32"],
      dispose: ["GdipDisposeImage", ["pointer"], "i32"]
    }
  });
  const readAppsAreLight = createLightReader({
    value: PersonalizeValue.APPS_ARE_LIGHT,
    isLightWhenMissing: true
  });
  const decoded = new Map<string, Raster | undefined>();

  function withGdiplus<T>(use: () => T) {
    const token = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
    const input = DynComRawMemory.allocate(GDIP_STARTUP_INPUT_BYTES, POINTER_BYTES);
    input.writeU32(0, 1);
    const isStarted = gdiplus.startup(token, input, null) === GDIP_OK;
    input.release();

    if (!isStarted) {
      token.release();
      return undefined;
    }

    try {
      return use();
    } finally {
      gdiplus.shutdown(token.readU64(0));
      token.release();
    }
  }

  function sizeOf(image: bigint) {
    return withMemory({
      size: POINTER_BYTES,
      alignment: POINTER_BYTES,
      use(out) {
        gdiplus.imageWidth(image, out);
        const width = out.readU32(0);
        gdiplus.imageHeight(image, out);
        return {
          width,
          height: out.readU32(0)
        };
      }
    });
  }

  function straightPixelsOf(image: bigint) {
    const { width, height } = sizeOf(image);
    return withMemory({
      size: RECT_BYTES + BITMAP_DATA_BYTES,
      alignment: POINTER_BYTES,
      use(block) {
        block.writeI32(OFFSET_RECT_WIDTH, width);
        block.writeI32(OFFSET_RECT_HEIGHT, height);
        const data = block.pointer(RECT_BYTES).address;
        const isLocked = gdiplus.lockBits(image, block, GDIP_LOCK_READ, GDIP_FORMAT_32BPP_ARGB, data) === GDIP_OK;
        if (!isLocked) {
          return undefined;
        }

        const stride = block.readI32(RECT_BYTES + OFFSET_STRIDE);
        const scan0 = block.readU64(RECT_BYTES + OFFSET_SCAN0);
        const bgra = new Uint8Array(width * height * BYTES_PER_PIXEL);
        const isTight = stride === width * BYTES_PER_PIXEL;
        if (isTight) {
          withMemory({
            size: bgra.length,
            alignment: BYTES_PER_PIXEL,
            use(copy) {
              copyMemory(copy, scan0, BigInt(bgra.length));
              bgra.set(copy.readBytes(0, bgra.length));
            }
          });
        }

        gdiplus.unlockBits(image, data);
        return isTight ? {
          width,
          height,
          bgra
        } : undefined;
      }
    });
  }

  function decode(file: string) {
    const name = wideMemory(file);
    const out = DynComRawMemory.allocate(POINTER_BYTES, POINTER_BYTES);
    try {
      const isLoaded = gdiplus.fromFile(name, out) === GDIP_OK;
      if (!isLoaded) {
        return undefined;
      }

      const image = out.readU64(0);
      const raster = straightPixelsOf(image);
      gdiplus.dispose(image);
      return raster;
    } finally {
      name.release();
      out.release();
    }
  }

  function rasterOfFile(file: string) {
    const key = fileKeyOf(file);
    const isMissing = key === undefined;
    if (isMissing) {
      return undefined;
    }

    if (!decoded.has(key)) {
      decoded.set(key, withGdiplus(() => decode(path.resolve(file))));
    }

    return decoded.get(key);
  }

  function sectionOf({ bytes, size }: {
    readonly bytes: Uint8Array;
    readonly size: number;
  }) {
    const block = DynComRawMemory.allocate(INFO_BYTES + POINTER_BYTES, POINTER_BYTES);
    const source = DynComRawMemory.allocate(bytes.length, BYTES_PER_PIXEL);
    try {
      block.writeU32(0, HEADER_BYTES);
      block.writeI32(OFFSET_WIDTH, size);
      block.writeI32(OFFSET_HEIGHT, -size);
      block.writeU16(OFFSET_PLANES, 1);
      block.writeU16(OFFSET_BIT_COUNT, BITS_PER_PIXEL);
      const bitsOut = block.pointer(INFO_BYTES).address;
      const bitmap = createSection(null, block, DIB_RGB_COLORS, bitsOut, null, 0);
      const bits = block.readU64(INFO_BYTES);
      const isMade = bitmap !== NO_BITMAP && bits !== NO_BITMAP;
      if (isMade) {
        source.writeBytes(0, Buffer.from(bytes));
        copyMemory(bits, source, BigInt(bytes.length));
      }

      return bitmap;
    } finally {
      block.release();
      source.release();
    }
  }

  const calls: MenuIconCalls = {
    isDark(colorScheme) {
      const isSystem = colorScheme === MenuColorScheme.SYSTEM;
      return isSystem ? !readAppsAreLight() : colorScheme === MenuColorScheme.DARK;
    },
    /** The side of a menu bitmap at the screen's scale: the menu's check mark, or the small icon if that is larger. */
    size() {
      const scale = dpi();
      return Math.max(metrics(SM_CXMENUCHECK, scale), metrics(SM_CXSMICON, scale));
    },
    /**
     * A premultiplied 32-bit bitmap of a picture, for `hbmpItem`.
     *
     * @returns The bitmap handle, to free with `free`; 0n when the picture cannot be read.
     */
    bitmapOf({ icon, isDark, isEnabled, isChecked, size }: {
      readonly icon: MenuIcon;
      readonly isDark: boolean;
      readonly isEnabled: boolean;
      readonly isChecked: boolean;
      readonly size: number;
    }) {
      const picture = pictureOf({
        icon,
        isDark
      });
      const { source } = picture;
      const raster = typeof source === "string" ? rasterOfFile(source) : rasterOf(source);
      const isUnreadable = raster === undefined;
      if (isUnreadable) {
        return NO_BITMAP;
      }

      const colored = picture.isTinted ? tintedRaster({
        raster,
        rgb: menuTextRgb(isDark)
      }) : raster;
      const square = premultipliedSquare({
        raster: isEnabled ? colored : dimmedRaster(colored),
        size
      });
      return sectionOf({
        bytes: isChecked ? framedSquare({
          bytes: square,
          size,
          rgb: menuTextRgb(isDark),
          alpha: isEnabled ? TICK_ALPHA : TICK_ALPHA * DISABLED_ALPHA
        }) : square,
        size
      });
    },
    /** Frees a bitmap `bitmapOf` made; call it after the menu is destroyed. */
    free(bitmap: bigint) {
      deleteObject(bitmap);
    }
  };
  return calls;
}

/**
 * The extra that draws the `icon` of the lines of a standalone tray's menu, as a bitmap beside the label:
 * a path to a png, ico, bmp, jpeg, gif or tiff, `IconPixels`, a `{ forLightMenu, forDarkMenu }` pair, or
 * `{ tinted }` for a monochrome glyph that takes the menu's text color. Pass it in `extras`; without it
 * no line shows an icon and none of this code is in the bundle.
 */
export const menuIcons: MenuIconsExtra = {
  kind: "menuIcons",
  createCalls() {
    return createMenuIconCalls();
  }
};
