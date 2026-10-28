import type { ColorInput } from "#src/components/values.js";
import { colorOf } from "#src/components/values.js";

// What a window's look is made of, as plain values: the closed sets the props
// take, and how they turn into what WinUI is told. apply-chrome.ts tells it.

/**
 * The theme a window's content and caption buttons use: light, dark, or the
 * system's setting (the default).
 */
export const WindowTheme = {
  light: "light",
  dark: "dark",
  system: "system"
} as const;

/** One of `WindowTheme`'s values. */
export type WindowTheme = (typeof WindowTheme)[keyof typeof WindowTheme];

/**
 * The height of a window's title bar, and its caption buttons, when the
 * content extends into it: the standard one, or the taller one that fits a
 * search box or tabs.
 */
export const TitleBarHeight = {
  standard: "standard",
  tall: "tall"
} as const;

/** One of `TitleBarHeight`'s values. */
export type TitleBarHeight = (typeof TitleBarHeight)[keyof typeof TitleBarHeight];

/**
 * How a window is presented: in its frame (windowed, the default), over the
 * whole display (fullScreen), or as a small always-on-top window
 * (compactOverlay, as a video player's picture in picture). The size limits
 * and the minimize and maximize buttons are the windowed one's.
 */
export const WindowPresentation = {
  windowed: "windowed",
  fullScreen: "fullScreen",
  compactOverlay: "compactOverlay"
} as const;

/** One of `WindowPresentation`'s values. */
export type WindowPresentation = (typeof WindowPresentation)[keyof typeof WindowPresentation];

/**
 * A rectangle in the window's client area, in device-independent pixels from
 * its top-left corner.
 */
export interface WindowRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The colors of the minimize, maximize and close buttons ("#rgb", "#rrggbb",
 * "#aarrggbb" or "transparent"). One left out keeps the system's.
 */
export interface CaptionButtonColors {
  foreground?: ColorInput;
  background?: ColorInput;
  hoverForeground?: ColorInput;
  hoverBackground?: ColorInput;
  pressedForeground?: ColorInput;
  pressedBackground?: ColorInput;

  /** While the window is not the active one. */
  inactiveForeground?: ColorInput;
  inactiveBackground?: ColorInput;
}

// Each CaptionButtonColors entry and the AppWindowTitleBar property it sets.
const CAPTION_BUTTON_ENTRIES = [
  ["foreground", "buttonForegroundColor"],
  ["background", "buttonBackgroundColor"],
  ["hoverForeground", "buttonHoverForegroundColor"],
  ["hoverBackground", "buttonHoverBackgroundColor"],
  ["pressedForeground", "buttonPressedForegroundColor"],
  ["pressedBackground", "buttonPressedBackgroundColor"],
  ["inactiveForeground", "buttonInactiveForegroundColor"],
  ["inactiveBackground", "buttonInactiveBackgroundColor"]
] as const satisfies ReadonlyArray<readonly [keyof CaptionButtonColors, string]>;

/** The AppWindowTitleBar property that holds one caption button color. */
export type CaptionButtonProperty = (typeof CAPTION_BUTTON_ENTRIES)[number][1];

// One title bar property and the color it is to hold; null puts the system's back.
interface CaptionButtonChange {
  property: CaptionButtonProperty;
  color: ReturnType<typeof colorOf> | null;
}

/**
 * What to write to the title bar so its caption buttons show `colors`: an
 * entry for each color given, and for each property in `applied` that `colors`
 * no longer gives (null, the system's). Throws a `TypeError` for a color that
 * is not one.
 */
export function captionButtonChanges({ colors, applied }: {
  colors: CaptionButtonColors | undefined;
  applied: ReadonlySet<CaptionButtonProperty>;
}) {
  const changes: CaptionButtonChange[] = [];
  for (const [name, property] of CAPTION_BUTTON_ENTRIES) {
    const input = colors?.[name];
    const isGiven = input !== undefined;
    if (isGiven) {
      changes.push({
        property,
        color: colorOf(input)
      });
      continue;
    }

    if (applied.has(property)) {
      changes.push({
        property,
        color: null
      });
    }
  }

  return changes;
}

/** `region` in device pixels, at `scale` device pixels per device-independent pixel. */
export function scaledRegion({ region, scale }: {
  region: WindowRegion;
  scale: number;
}) {
  return {
    x: Math.round(region.x * scale),
    y: Math.round(region.y * scale),
    width: Math.round(region.width * scale),
    height: Math.round(region.height * scale)
  };
}
