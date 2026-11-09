import type { MenuIcon } from "./menu/types.ts";
import type { Balloon, BalloonWriter, NotifyOperation, ScreenRect } from "./native.ts";
import type { MenuColorScheme } from "./standalone/menu-theme.ts";
import type { BalloonOptions, TrayIconImage } from "./tray-core.ts";

/** What an extra may use of a live tray icon. */
export interface TrayContext {
  /** Sends one Shell_NotifyIcon call for this icon; false when the shell refused. */
  send(options: {
    operation: NotifyOperation;
    balloon?: Balloon | null;
  }): boolean;
  readonly isRegistered: () => boolean;
  readonly iconRect: () => ScreenRect | null;
}

/** The extra that adds `notify`: balloons over the icon. Import `balloons`. */
export interface BalloonsExtra {
  readonly kind: "balloons";
  readonly writeBalloon: BalloonWriter;
  extend(context: TrayContext): {
    /** Shows a balloon over the icon. Its click cannot be heard (see the README). */
    notify(balloon: BalloonOptions): void;
  };
}

/** The extra that adds `bounds`: where the shell draws the icon. Import `bounds`. */
export interface BoundsExtra {
  readonly kind: "bounds";
  extend(context: TrayContext): {
    /** Where the shell draws the icon, in screen pixels; null when it does not. */
    bounds(): ScreenRect | null;
  };
}

/** The extra that lets `icon` be a picture for each taskbar theme, swapped as it changes. Import `themedIcon`. */
export interface ThemedIconExtra {
  readonly kind: "themedIcon";
  createReader(): () => boolean;
}

/** What the popup menu calls to draw the icon of a line. */
export interface MenuIconCalls {
  /** The side of a menu bitmap, in pixels, at the screen's scale. */
  size(): number;

  /** Whether a menu of this color scheme is dark now, read fresh on each call. */
  isDark(colorScheme: MenuColorScheme): boolean;

  /** Makes the premultiplied bitmap of an icon for the theme; 0n when the picture cannot be read. */
  bitmapOf(options: {
    readonly icon: MenuIcon;
    readonly isDark: boolean;
    readonly isEnabled: boolean;
    readonly isChecked: boolean;
    readonly size: number;
  }): bigint;

  /** Frees a bitmap `bitmapOf` made. */
  free(bitmap: bigint): void;
}

/** The extra that draws the `icon` of the lines of a standalone tray's menu. Import `menuIcons`. */
export interface MenuIconsExtra {
  readonly kind: "menuIcons";
  createCalls(): MenuIconCalls;
}

/** One of the four optional parts of a tray icon. */
export type TrayExtra = BalloonsExtra | BoundsExtra | ThemedIconExtra | MenuIconsExtra;

type HasExtra<Extras extends readonly TrayExtra[], Kind extends TrayExtra["kind"]> =
  [Extract<Extras[number], { readonly kind: Kind }>] extends [never] ? false : true;

/** The icon's picture type: a `{ forLightTaskbar, forDarkTaskbar }` pair only with the `themedIcon` extra. */
export type ImageOf<Extras extends readonly TrayExtra[]> =
  HasExtra<Extras, "themedIcon"> extends true ? TrayIconImage : string;

/** What can change on a live tray icon made with these extras. */
export interface TrayChanges<Extras extends readonly TrayExtra[]> {
  readonly icon?: ImageOf<Extras> | undefined;
  readonly tooltip?: string | undefined;
  readonly isVisible?: boolean | undefined;
}

interface TrayBase<Extras extends readonly TrayExtra[]> {
  /** Changes the picture, the tooltip or whether the icon shows. */
  update(changes: TrayChanges<Extras>): void;

  /** Takes the icon out of the tray and frees what it held. Safe to call twice. */
  remove(): void;

  /** The shell has the icon now. */
  readonly isRegistered: boolean;
}

/** The live tray icon: `update`, `remove` and `isRegistered`, plus `notify` and `bounds` for the extras given. */
export type TrayHandle<Extras extends readonly TrayExtra[]> = TrayBase<Extras>
  & (HasExtra<Extras, "balloons"> extends true ? ReturnType<BalloonsExtra["extend"]> : unknown)
  & (HasExtra<Extras, "bounds"> extends true ? ReturnType<BoundsExtra["extend"]> : unknown);
