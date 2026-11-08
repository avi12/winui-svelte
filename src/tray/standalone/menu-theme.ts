import { bindDll } from "#src/win32-calls.js";

const SET_PREFERRED_APP_MODE_ORDINAL = 135n;
const FLUSH_MENU_THEMES_ORDINAL = 136n;
const NO_ADDRESS = 0n;
const NO_MESSAGE = 0;

/**
 * The CSS `color-scheme` values a standalone tray's menu understands: `"light dark"` follows the
 * system (the web's default for a page that supports both), `"light"` and `"dark"` force one.
 */
export const MenuColorScheme = {
  SYSTEM: "light dark",
  LIGHT: "light",
  DARK: "dark"
} as const;

/** One of the `color-scheme` values a standalone tray's menu understands. */
export type MenuColorScheme = typeof MenuColorScheme[keyof typeof MenuColorScheme];

/** The values `SetPreferredAppMode` takes. */
export const PreferredAppMode = {
  DEFAULT: 0,
  ALLOW_DARK: 1,
  FORCE_DARK: 2,
  FORCE_LIGHT: 3
} as const;

/**
 * The preferred app mode of a color scheme.
 *
 * @param colorScheme - What the menu should follow.
 * @returns The mode `SetPreferredAppMode` takes.
 */
export function appModeOf(colorScheme: MenuColorScheme) {
  const isDark = colorScheme === MenuColorScheme.DARK;
  if (isDark) {
    return PreferredAppMode.FORCE_DARK;
  }

  const isLight = colorScheme === MenuColorScheme.LIGHT;
  if (isLight) {
    return PreferredAppMode.FORCE_LIGHT;
  }

  return PreferredAppMode.ALLOW_DARK;
}

/** Makes the process's popup menus follow a color scheme. */
export interface MenuTheme {
  /** Sets the process's menu theme; cheap enough to call before every menu, so a system change is seen. */
  apply(colorScheme: MenuColorScheme): void;
}

/**
 * The undocumented uxtheme calls that dark popup menus take (`SetPreferredAppMode` and
 * `FlushMenuThemes`, exported by ordinal only, as in the C# any-stt menu), bound when this is called.
 * `bind` cannot take an ordinal, so the entry points are found with `GetProcAddress` and called
 * through `CallWindowProcW`, which calls any address with up to four arguments.
 */
export function createMenuTheme() {
  const { loadLibrary, procAddress } = bindDll({
    dll: "kernel32.dll",
    functions: {
      loadLibrary: ["LoadLibraryW", ["pointer"], "pointer"],
      procAddress: ["GetProcAddress", ["pointer", "pointer"], "pointer"]
    }
  });
  const { callAddress } = bindDll({
    dll: "user32.dll",
    functions: {
      callAddress: ["CallWindowProcW", ["pointer", "pointer", "u32", "pointer", "pointer"], "pointer"]
    }
  });
  const uxtheme = loadLibrary("uxtheme.dll");
  const setPreferredAppMode = procAddress(uxtheme, SET_PREFERRED_APP_MODE_ORDINAL);
  const flushMenuThemes = procAddress(uxtheme, FLUSH_MENU_THEMES_ORDINAL);
  const isAvailable = uxtheme !== NO_ADDRESS && setPreferredAppMode !== NO_ADDRESS && flushMenuThemes !== NO_ADDRESS;
  const theme: MenuTheme = {
    apply(colorScheme) {
      if (!isAvailable) {
        return;
      }

      callAddress(setPreferredAppMode, BigInt(appModeOf(colorScheme)), NO_MESSAGE, null, null);
      callAddress(flushMenuThemes, NO_ADDRESS, NO_MESSAGE, null, null);
    }
  };
  return theme;
}
