import { addressOf, bind, bindDll, pointerOf } from "./win32-calls.ts";
import { DynComRawMemory } from "@microsoft/dynwinrt/com/unsafe/raw";
import { DynWin32, DynWin32Unsafe } from "@microsoft/dynwinrt/win32/unsafe";

// The calls every icon the package puts on the shell is made of (the tray
// icon, the taskbar overlay): loading an .ico file, building an icon from
// pixels, destroying it and the size the shell draws it at.

const IMAGE_ICON = 1;
const LOAD_FROM_FILE = 0x10;
const SM_CXSMICON = 49;
/** Bytes of one pixel: blue, green, red, alpha. */
export const BYTES_PER_PIXEL = 4;
const BITS_PER_PIXEL = 32;
const MASK_ROW_ALIGNMENT_BITS = 16;
const MASK_ROW_ALIGNMENT_BYTES = 2;
const ICON_INFO_SIZE = 32;
const POINTER_BYTES = 8;
const OFFSET_IS_ICON = 0;
const OFFSET_MASK = 16;
const OFFSET_COLOR = 24;

/** Pixels of a square icon: `bgra` is `size * size * 4` bytes, blue first, straight (not premultiplied) alpha. */
export interface IconPixels {
  readonly size: number;
  readonly bgra: Uint8Array;
}

/**
 * The calls for an icon loaded from an .ico file, bound when this is called,
 * never when the module loads.
 *
 * @returns The calls: load, destroy and the shell's icon size.
 */
export function createIconFileCalls() {
  const { loadImage, destroyIcon, systemDpi, metricsForDpi } = bindDll({
    dll: "user32.dll",
    functions: {
      loadImage: ["LoadImageW", ["pointer", "pointer", "u32", "i32", "i32", "u32"], "pointer"],
      destroyIcon: ["DestroyIcon", ["pointer"], "i32"],
      systemDpi: ["GetDpiForSystem", [], "u32"],
      metricsForDpi: ["GetSystemMetricsForDpi", ["i32", "u32"], "i32"]
    }
  });

  return {
    /** Loads an .ico file at `size` pixels square; 0n when it cannot. */
    loadIconFile({ path, size }: {
      path: string;
      size: number;
    }) {
      return loadImage(null, path, IMAGE_ICON, size, size, LOAD_FROM_FILE);
    },
    destroyIcon(icon: bigint) {
      destroyIcon(icon);
    },
    /** Pixels of a small icon (a tray icon, a taskbar overlay) at the system scale. */
    smallIconSize() {
      return metricsForDpi(SM_CXSMICON, systemDpi());
    }
  };
}

/**
 * The call that builds an icon from pixels, bound when this is called; apart
 * from the file calls, so a tray that only loads files does not bundle it.
 *
 * @returns The call; destroy what it makes with `destroyIcon` of the file calls.
 */
export function createPixelIconCalls() {
  const createBitmap = bind({
    dll: "gdi32.dll",
    entryPoint: "CreateBitmap",
    parameters: ["i32", "i32", "u32", "u32", "pointer"],
    returnType: "pointer"
  });
  const deleteObject = bind({
    dll: "gdi32.dll",
    entryPoint: "DeleteObject",
    parameters: ["pointer"],
    returnType: "i32"
  });
  const createIconIndirect = bind({
    dll: "user32.dll",
    entryPoint: "CreateIconIndirect",
    parameters: ["pointer"],
    returnType: "pointer"
  });

  function bitmapOf({ width, height, bitsPerPixel, bits }: {
    width: number;
    height: number;
    bitsPerPixel: number;
    bits: Uint8Array;
  }) {
    const memory = DynComRawMemory.allocate(bits.length, POINTER_BYTES);
    try {
      memory.writeBytes(0, Buffer.from(bits));
      const made = createBitmap.invoke([
        DynWin32.i32(width), DynWin32.i32(height), DynWin32.u32(1), DynWin32.u32(bitsPerPixel), pointerOf(memory)
      ]);
      return addressOf(made.returnValue);
    } finally {
      memory.release();
    }
  }

  return {
    /** Builds an icon from pixels with alpha; 0n when Windows refuses. Destroy it with `destroyIcon`. */
    createIcon({ size, bgra }: IconPixels) {
      const maskRowBytes = Math.ceil(size / MASK_ROW_ALIGNMENT_BITS) * MASK_ROW_ALIGNMENT_BYTES;
      const color = bitmapOf({
        width: size,
        height: size,
        bitsPerPixel: BITS_PER_PIXEL,
        bits: bgra
      });
      const mask = bitmapOf({
        width: size,
        height: size,
        bitsPerPixel: 1,
        bits: new Uint8Array(maskRowBytes * size)
      });
      const info = DynComRawMemory.allocate(ICON_INFO_SIZE, POINTER_BYTES);
      try {
        info.writeU32(OFFSET_IS_ICON, 1);
        info.writeU64(OFFSET_MASK, mask);
        info.writeU64(OFFSET_COLOR, color);
        return addressOf(createIconIndirect.invoke([pointerOf(info)]).returnValue);
      } finally {
        info.release();
        deleteObject.invoke([DynWin32Unsafe.pointer(color)]);
        deleteObject.invoke([DynWin32Unsafe.pointer(mask)]);
      }
    }
  };
}

/** Bytes in an `IconPixels` square of `size`. */
export function pixelBytes(size: number) {
  return size * size * BYTES_PER_PIXEL;
}
