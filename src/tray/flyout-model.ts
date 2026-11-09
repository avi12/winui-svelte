import { pictureOf } from "./menu/icon.ts";
import type { ResolvedCheck, ResolvedCommand, ResolvedRadio } from "./menu/types.ts";
import type { MenuIcon } from "./menu/types.ts";
import { pathToFileURL } from "node:url";

// What a WinUI MenuFlyout can say of a resolved line, as plain values, so that
// the mapping is tested without WinUI.

const ACCELERATOR_SEPARATOR = "   ";
const IMAGE_FILE = /\.(?:ico|png)$/iu;

/** The kinds of icon a flyout item draws. */
export const FlyoutIconKind = {
  GLYPH: "glyph",
  FILE: "file"
} as const;

type FlyoutIcon =
  | {
    readonly kind: typeof FlyoutIconKind.GLYPH;
    readonly glyph: string;
  }
  | {
    readonly kind: typeof FlyoutIconKind.FILE;
    readonly uri: string;
  };

/** A line the user can pick: a command, a check or a radio; a submenu row opens, it is never picked. */
export type PickableItem = ResolvedCommand | ResolvedCheck | ResolvedRadio;

/**
 * The icon a flyout draws for the model's `icon`: a path to an `.ico` or
 * `.png` is the image, any other text is a glyph. Raw pixels are not drawn; of a pair the light member is
 * drawn, and a tinted glyph is drawn as its source.
 *
 * @param icon - The resolved line's icon.
 * @returns What to draw, or undefined for none.
 */
export function flyoutIconOf(menuIcon: MenuIcon | undefined) {
  const hasIcon = menuIcon !== undefined;
  if (!hasIcon) {
    return undefined;
  }

  const { source: icon } = pictureOf({
    icon: menuIcon,
    isDark: false
  });
  const isText = typeof icon === "string";
  if (!isText) {
    return undefined;
  }

  const isImageFile = IMAGE_FILE.test(icon);
  if (isImageFile) {
    return {
      kind: FlyoutIconKind.FILE,
      uri: pathToFileURL(icon).href
    } satisfies FlyoutIcon;
  }

  return {
    kind: FlyoutIconKind.GLYPH,
    glyph: icon
  } satisfies FlyoutIcon;
}

/**
 * The trailing text of an item: its badge, then its shortcut (a flyout has one
 * trailing column, which is the keyboard accelerator's).
 *
 * @param item - A command, check or radio.
 * @returns The text, empty when there is neither.
 */
export function trailingTextOf({ badge, shortcut }: Pick<PickableItem, "badge" | "shortcut">) {
  const parts = [badge, shortcut].filter(part => part !== undefined && part !== "");
  return parts.join(ACCELERATOR_SEPARATOR);
}

/**
 * The font weight of a line: bold when the model says so.
 *
 * @param item - Any line with a label.
 * @returns A weight name.
 */
export function weightOf({ isBold }: { readonly isBold: boolean }) {
  return isBold ? "bold" as const : "normal" as const;
}
