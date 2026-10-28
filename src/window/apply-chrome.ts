import type { CaptionButtonColors, CaptionButtonProperty } from "./chrome.ts";
import {
  captionButtonChanges,
  scaledRegion,
  TitleBarHeight,
  WindowPresentation,
  WindowTheme
} from "./chrome.ts";
import type { WindowRegion } from "./chrome.ts";
import type { AppWindow, FrameworkElement, NonClientRegionKind } from "#src/winui.js";
import {
  AppWindowPresenterKind,
  ElementTheme,
  InputNonClientPointerSource,
  TitleBarHeightOption,
  TitleBarTheme
} from "#src/winui.js";

// Tells WinUI a window's theme, title bar and non-client regions (chrome.ts
// says what they are).

const ELEMENT_THEMES = {
  [WindowTheme.light]: ElementTheme.Light,
  [WindowTheme.dark]: ElementTheme.Dark,
  [WindowTheme.system]: ElementTheme.Default
} as const satisfies Record<WindowTheme, ElementTheme>;

const TITLE_BAR_THEMES = {
  [WindowTheme.light]: TitleBarTheme.Light,
  [WindowTheme.dark]: TitleBarTheme.Dark,
  [WindowTheme.system]: TitleBarTheme.UseDefaultAppMode
} as const satisfies Record<WindowTheme, TitleBarTheme>;

const TITLE_BAR_HEIGHTS = {
  [TitleBarHeight.standard]: TitleBarHeightOption.Standard,
  [TitleBarHeight.tall]: TitleBarHeightOption.Tall
} as const satisfies Record<TitleBarHeight, TitleBarHeightOption>;

const PRESENTER_KINDS = {
  [WindowPresentation.windowed]: AppWindowPresenterKind.Overlapped,
  [WindowPresentation.fullScreen]: AppWindowPresenterKind.FullScreen,
  [WindowPresentation.compactOverlay]: AppWindowPresenterKind.CompactOverlay
} as const satisfies Record<WindowPresentation, AppWindowPresenterKind>;

/**
 * Presents the window as `presentation`. Back to windowed it is a new
 * overlapped presenter, with none of the limits set on the last one.
 */
export function applyPresentation({ appWindow, presentation }: {
  appWindow: AppWindow;
  presentation: WindowPresentation;
}) {
  appWindow.setPresenterByKind(PRESENTER_KINDS[presentation]);
}

/** Makes the content, and the caption buttons, light or dark, or the system's. */
export function applyTheme({ appWindow, content, theme }: {
  appWindow: AppWindow;
  content: FrameworkElement;
  theme: WindowTheme;
}) {
  content.requestedTheme = ELEMENT_THEMES[theme];
  appWindow.titleBar.preferredTheme = TITLE_BAR_THEMES[theme];
}

/** Gives the title bar its height. */
export function applyTitleBarHeight({ appWindow, height }: {
  appWindow: AppWindow;
  height: TitleBarHeight;
}) {
  appWindow.titleBar.preferredHeightOption = TITLE_BAR_HEIGHTS[height];
}

/**
 * Gives the caption buttons `colors`, and puts the system's back on the
 * properties of `applied` that `colors` no longer gives; returns the
 * properties it holds now.
 */
export function applyCaptionButtonColors({ appWindow, colors, applied }: {
  appWindow: AppWindow;
  colors: CaptionButtonColors | undefined;
  applied: ReadonlySet<CaptionButtonProperty>;
}) {
  const { titleBar } = appWindow;
  const holds = new Set<CaptionButtonProperty>();
  for (const { property, color } of captionButtonChanges({
    colors,
    applied
  })) {
    titleBar[property] = color;

    const isColored = color !== null;
    if (isColored) {
      holds.add(property);
    }
  }

  return holds;
}

/**
 * Makes `regions` (device-independent pixels) the window's non-client region
 * of `kind` (caption: it drags the window; passthrough: inside a caption, it
 * takes the pointer itself). No regions clears the kind.
 */
export function applyRegions({ appWindow, kind, regions, scale }: {
  appWindow: AppWindow;
  kind: NonClientRegionKind;
  regions: readonly WindowRegion[];
  scale: number;
}) {
  const source = InputNonClientPointerSource.getForWindowId(appWindow.id);
  const isEmpty = regions.length === 0;
  if (isEmpty) {
    source.clearRegionRects(kind);
    return;
  }

  source.setRegionRects(
    kind, regions.map(region => scaledRegion({
      region,
      scale
    }))
  );
}
