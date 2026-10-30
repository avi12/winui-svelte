// Every media feature the library can answer, in one table: what it measures,
// how its value is written, where the answer comes from and which change of
// the environment can flip it. The query evaluator (query.ts), the CSS runtime
// and `matchMedia` all read this table, so a new feature is one row.

/** A size in px. */
export interface MediaSize {
  readonly width: number;
  readonly height: number;
}

/** How a window is shown: in its frame, over the whole display, or as a small always-on-top window. */
export const MediaPresentation = {
  windowed: "windowed",
  fullScreen: "fullScreen",
  compactOverlay: "compactOverlay"
} as const;

/** One of `MediaPresentation`'s values. */
export type MediaPresentation = (typeof MediaPresentation)[keyof typeof MediaPresentation];

/** The widest range of colors a display shows. */
export const ColorGamut = {
  srgb: "srgb",
  p3: "p3",
  rec2020: "rec2020"
} as const;

/** One of `ColorGamut`'s values. */
export type ColorGamut = (typeof ColorGamut)[keyof typeof ColorGamut];

/** The input devices present. */
export interface MediaDevices {
  readonly hasMouse: boolean;
  readonly hasTouch: boolean;
  readonly hasPen: boolean;
}

/**
 * Where the answers come from. Each member reads live; the real one is built
 * over Windows' settings (`media-store.ts`), a test stands in for it.
 */
export interface MediaInputs {
  /** The window's client area, in px; null where it is not known. */
  viewport(): MediaSize | null;
  /** The monitor, in px; null where it is not known. */
  display(): MediaSize | null;
  /** Device pixels per CSS px (`RasterizationScale`). */
  scale(): number;
  isDark(): boolean;
  isHighContrast(): boolean;
  isAnimationEnabled(): boolean;
  isTransparencyEnabled(): boolean;
  presentation(): MediaPresentation;
  devices(): MediaDevices;
  isHdr(): boolean;
  gamut(): ColorGamut;
  isMetered(): boolean;
}

/** What can change an answer: the store tells which of these happened. */
export type MediaChange =
  | "viewport"
  | "display"
  | "scale"
  | "settings"
  | "presentation"
  | "devices"
  | "dynamicRange"
  | "connection";

/**
 * The answers to every media feature and the way to hear that one may have
 * changed: what `matchMedia`, `mediaQuery` and the CSS runtime's `@media`
 * watcher are all built on.
 */
export interface MediaStore {
  readonly inputs: MediaInputs;
  /** Calls back when any of the changes happens; returns the way to stop. */
  subscribe(options: {
    changes: ReadonlySet<MediaChange>;
    callback: () => void;
  }): () => void;
}

/** How the value of a numeric feature is written. */
export const MediaUnit = {
  length: "length",
  resolution: "resolution",
  ratio: "ratio",
  number: "number"
} as const;

/** One of `MediaUnit`'s values. */
export type MediaUnit = (typeof MediaUnit)[keyof typeof MediaUnit];

/**
 * The answer of one feature: a number (px, dppx, a ratio or a count), a
 * keyword, several keywords (`any-pointer`), or null when unknown.
 */
export type FeatureAnswer = number | string | readonly string[] | null;

/** One row of the table. */
export interface MediaFeature {
  /** `range` takes `min-`, `max-` and comparisons; `discrete` a keyword. */
  readonly kind: "range" | "discrete";
  /** Of a range feature. */
  readonly unit?: MediaUnit;
  /**
   * Of an ordered discrete feature: a value holds when the answer is at least
   * as far along (`color-gamut: p3` holds on a rec2020 display).
   */
  readonly order?: readonly string[];
  /** The keyword that makes the feature false in a boolean query (`(forced-colors)`). */
  readonly falseKeyword?: string;
  read(inputs: MediaInputs): FeatureAnswer;
  readonly changes: readonly MediaChange[];
  /** Where the answer comes from, or why it is constant; the table in src/css/API.md is written from it. */
  readonly source: string;
}

const NONE = "none";
const NO_PREFERENCE = "no-preference";
const REDUCE = "reduce";
const SCROLL = "scroll";
const SINGLE_SEGMENT = 1;
const COLOR_BITS = 8;
const DISPLAY_SOURCE = "the primary monitor (DisplayArea), in device pixels";
const VIEWPORT_SOURCE = "the window's client area in a stylesheet; in matchMedia the size the app supplies (the primary monitor otherwise)";
const SCALE_SOURCE = "the element's XamlRoot.RasterizationScale in a stylesheet; in matchMedia the scale the app supplies (1 otherwise)";
const RANGE_CONSTANT_UNIT = "number";

function ratioOf(size: MediaSize | null) {
  const isMeasurable = size !== null && size.height > 0;
  return isMeasurable ? size.width / size.height : null;
}

function orientationOf(size: MediaSize | null) {
  const isMeasurable = size !== null;
  if (!isMeasurable) {
    return null;
  }

  return size.height >= size.width ? "portrait" : "landscape";
}

function pointerOf(devices: MediaDevices) {
  const answers: string[] = [];
  const hasFinePointer = devices.hasMouse || devices.hasPen;
  if (hasFinePointer) {
    answers.push("fine");
  }

  if (devices.hasTouch) {
    answers.push("coarse");
  }

  const isEmpty = answers.length === 0;
  return isEmpty ? [NONE] : answers;
}

function hoverOf(devices: MediaDevices) {
  const canHover = devices.hasMouse || devices.hasPen;
  return canHover ? "hover" : NONE;
}

function keyword({ answer, source }: {
  answer: string;
  source: string;
}) {
  return {
    kind: "discrete",
    read: () => answer,
    changes: [],
    source
  } satisfies MediaFeature;
}

function count({ answer, source }: {
  answer: number;
  source: string;
}) {
  return {
    kind: "range",
    unit: RANGE_CONSTANT_UNIT,
    read: () => answer,
    changes: [],
    source
  } satisfies MediaFeature;
}

function setting({ read, falseKeyword, source }: {
  read(inputs: MediaInputs): string;
  falseKeyword: string;
  source: string;
}) {
  return {
    kind: "discrete",
    falseKeyword,
    read,
    changes: ["settings"],
    source
  } satisfies MediaFeature;
}

function pointer({ read, source }: {
  read(devices: MediaDevices): FeatureAnswer;
  source: string;
}) {
  return {
    kind: "discrete",
    falseKeyword: NONE,
    read: inputs => read(inputs.devices()),
    changes: ["devices"],
    source
  } satisfies MediaFeature;
}

function dynamicRange(source: string) {
  return {
    kind: "discrete",
    order: ["standard", "high"],
    read: inputs => (inputs.isHdr() ? "high" : "standard"),
    changes: ["dynamicRange"],
    source
  } satisfies MediaFeature;
}

function viewportSize({ read, unit }: {
  read(size: MediaSize | null): number | null;
  unit: MediaUnit;
}) {
  return {
    kind: "range",
    unit,
    read: inputs => read(inputs.viewport()),
    changes: ["viewport"],
    source: VIEWPORT_SOURCE
  } satisfies MediaFeature;
}

function displaySize({ read, unit }: {
  read(size: MediaSize | null): number | null;
  unit: MediaUnit;
}) {
  return {
    kind: "range",
    unit,
    read: inputs => read(inputs.display()),
    changes: ["display"],
    source: DISPLAY_SOURCE
  } satisfies MediaFeature;
}

function scale(unit: MediaUnit) {
  return {
    kind: "range",
    unit,
    read: inputs => inputs.scale(),
    changes: ["scale"],
    source: SCALE_SOURCE
  } satisfies MediaFeature;
}

const DISPLAY_MODES: Readonly<Record<MediaPresentation, string>> = {
  [MediaPresentation.windowed]: "standalone",
  [MediaPresentation.fullScreen]: "fullscreen",
  [MediaPresentation.compactOverlay]: "picture-in-picture"
};

/**
 * The features by name. A range feature also answers `min-` and `max-` forms
 * and the comparison syntax; `-webkit-device-pixel-ratio` keeps its prefix.
 */
export const MEDIA_FEATURES: ReadonlyMap<string, MediaFeature> = new Map<string, MediaFeature>([
  ["width", viewportSize({
    read: size => size?.width ?? null,
    unit: "length"
  })],
  ["height", viewportSize({
    read: size => size?.height ?? null,
    unit: "length"
  })],
  ["aspect-ratio", viewportSize({
    read: ratioOf,
    unit: "ratio"
  })],
  ["orientation", {
    kind: "discrete",
    read: inputs => orientationOf(inputs.viewport()),
    changes: ["viewport"],
    source: VIEWPORT_SOURCE
  }],
  ["device-width", displaySize({
    read: size => size?.width ?? null,
    unit: "length"
  })],
  ["device-height", displaySize({
    read: size => size?.height ?? null,
    unit: "length"
  })],
  ["device-aspect-ratio", displaySize({
    read: ratioOf,
    unit: "ratio"
  })],
  ["resolution", scale("resolution")],
  ["-webkit-device-pixel-ratio", scale("number")],
  ["display-mode", {
    kind: "discrete",
    read: inputs => DISPLAY_MODES[inputs.presentation()],
    changes: ["presentation"],
    source: "the presenter the app supplies (standalone otherwise)"
  }],
  ["color", count({
    answer: COLOR_BITS,
    source: "always 8 bits per channel: Windows composes in 8-bit sRGB or wider"
  })],
  ["color-index", count({
    answer: 0,
    source: "always 0: no display uses an indexed palette"
  })],
  ["monochrome", count({
    answer: 0,
    source: "always 0: the display is a color one"
  })],
  ["grid", count({
    answer: 0,
    source: "always 0: a window is a bitmap display, not a character grid"
  })],
  ["color-gamut", {
    kind: "discrete",
    order: Object.values(ColorGamut),
    read: inputs => inputs.gamut(),
    changes: ["dynamicRange"],
    source: "srgb, or what the app supplies: the display's advanced color info needs QueryDisplayConfig and DisplayConfigGetDeviceInfo (DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO) through native structs, which the bindings do not wrap yet"
  }],
  ["dynamic-range", dynamicRange("standard, or what the app supplies: the display's advanced color info needs QueryDisplayConfig and DisplayConfigGetDeviceInfo (DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO) through native structs, which the bindings do not wrap yet")],
  ["video-dynamic-range", dynamicRange("standard, or what the app supplies: the display's advanced color info needs QueryDisplayConfig and DisplayConfigGetDeviceInfo (DISPLAYCONFIG_GET_ADVANCED_COLOR_INFO) through native structs, which the bindings do not wrap yet")],
  ["hover", pointer({
    read: hoverOf,
    source: "read from GetSystemMetrics (mouse present, digitizer touch and pen bits), asked again every two seconds while a query listens"
  })],
  ["any-hover", pointer({
    read: hoverOf,
    source: "read from GetSystemMetrics (mouse present, digitizer touch and pen bits), asked again every two seconds while a query listens"
  })],
  ["pointer", pointer({
    read: devices => pointerOf(devices).slice(0, 1),
    source: "read from GetSystemMetrics: fine for a mouse or pen, coarse when touch is the only pointer"
  })],
  ["any-pointer", pointer({
    read: pointerOf,
    source: "read from GetSystemMetrics: fine for a mouse or pen, coarse when touch is the only pointer"
  })],
  ["scan", keyword({
    answer: "progressive",
    source: "always progressive: a flat panel does not interlace"
  })],
  ["update", keyword({
    answer: "fast",
    source: "always fast: a window repaints at the display's rate"
  })],
  ["overflow-block", keyword({
    answer: SCROLL,
    source: "always scroll: a window has no pages"
  })],
  ["overflow-inline", keyword({
    answer: SCROLL,
    source: "always scroll: a window has no pages"
  })],
  ["scripting", keyword({
    answer: "enabled",
    source: "always enabled: the app is the script"
  })],
  ["prefers-color-scheme", setting({
    read: inputs => (inputs.isDark() ? "dark" : "light"),
    falseKeyword: "",
    source: "the element's ActualTheme in a stylesheet; UISettings' foreground color in matchMedia (Windows' app mode)"
  })],
  ["prefers-contrast", setting({
    read: inputs => (inputs.isHighContrast() ? "more" : NO_PREFERENCE),
    falseKeyword: NO_PREFERENCE,
    source: "AccessibilitySettings.HighContrast (more while a contrast theme is on; less and custom never match)"
  })],
  ["prefers-reduced-motion", setting({
    read: inputs => (inputs.isAnimationEnabled() ? NO_PREFERENCE : REDUCE),
    falseKeyword: NO_PREFERENCE,
    source: "UISettings.AnimationsEnabled"
  })],
  ["prefers-reduced-transparency", setting({
    read: inputs => (inputs.isTransparencyEnabled() ? NO_PREFERENCE : REDUCE),
    falseKeyword: NO_PREFERENCE,
    source: "UISettings.AdvancedEffectsEnabled (Transparency effects)"
  })],
  ["forced-colors", setting({
    read: inputs => (inputs.isHighContrast() ? "active" : NONE),
    falseKeyword: NONE,
    source: "AccessibilitySettings.HighContrast"
  })],
  ["prefers-reduced-data", {
    kind: "discrete",
    falseKeyword: NO_PREFERENCE,
    read: inputs => (inputs.isMetered() ? REDUCE : NO_PREFERENCE),
    changes: ["connection"],
    source: "no-preference, or what the app supplies: Windows.Networking.Connectivity.NetworkInformation is not in the generated bindings (only ConnectionCost is)"
  }],
  ["inverted-colors", keyword({
    answer: NONE,
    source: "always none: Windows has no color inversion that apps are told of"
  })],
  ["light-level", keyword({
    answer: "normal",
    source: "always normal: no ambient light sensor is read"
  })],
  ["nav-controls", keyword({
    answer: "back",
    source: "always back: a window offers its own navigation"
  })],
  ["horizontal-viewport-segments", count({
    answer: SINGLE_SEGMENT,
    source: "always 1: a window is one segment"
  })],
  ["vertical-viewport-segments", count({
    answer: SINGLE_SEGMENT,
    source: "always 1: a window is one segment"
  })],
  ["device-posture", keyword({
    answer: "continuous",
    source: "always continuous: no fold is reported"
  })]
]);
