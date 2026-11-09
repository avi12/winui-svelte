import type { MenuIcon, MenuIconTinted } from "./types.ts";
import type { IconPixels } from "#src/win32-icons.js";

function isPixels(icon: object): icon is IconPixels {
  return "bgra" in icon;
}

function plainPictureOf(icon: string | IconPixels | MenuIconTinted) {
  const isPlain = typeof icon === "string" || isPixels(icon);
  if (isPlain) {
    return {
      source: icon,
      isTinted: false
    };
  }

  return {
    source: icon.tinted,
    isTinted: true
  };
}

/**
 * Chooses the picture of a line's `icon` for a menu theme: a pair gives its dark or its light member, a
 * tinted glyph gives its source marked as tinted, anything else is the picture itself.
 *
 * @param options - `icon`: what the line declares; `isDark`: whether the menu is dark now.
 * @returns The path or pixels, and whether the menu tints it.
 */
export function pictureOf({ icon, isDark }: {
  readonly icon: MenuIcon;
  readonly isDark: boolean;
}) {
  const isPair = typeof icon !== "string" && "forLightMenu" in icon;
  if (isPair) {
    return plainPictureOf(isDark ? icon.forDarkMenu : icon.forLightMenu);
  }

  return plainPictureOf(icon);
}
