/** What WinUI makes of a CSS length unit. */
export const LengthUnitKind = {
  /** Converted to device-independent pixels while building. */
  BUILD: "build",
  /** Resolved when the window is laid out, inside `calc()`, `min()`, `max()` or `clamp()`. */
  RUNTIME: "runtime",
  /** Has no WinUI meaning; the build fails. */
  UNSUPPORTED: "unsupported"
} as const;

/** One of the kinds in `LengthUnitKind`. */
export type LengthUnitKind = (typeof LengthUnitKind)[keyof typeof LengthUnitKind];

/** How a unit is treated; `pixels` is what one unit is worth, for a `build` unit. */
export interface LengthUnit {
  kind: LengthUnitKind;
  pixels?: number;
  /** Why an `unsupported` unit has no meaning. */
  reason?: string;
  /** What to write instead, for an `unsupported` unit. */
  advice?: string;
}

const PIXELS_PER_INCH = 96;
const MILLIMETERS_PER_INCH = 25.4;
const POINTS_PER_INCH = 72;
const PICAS_PER_INCH = 6;
const QUARTERS_PER_MILLIMETER = 4;
const QUARTER_MILLIMETERS_PER_INCH = MILLIMETERS_PER_INCH * QUARTERS_PER_MILLIMETER;
// WinUI has no root or element font size: both are the browser's default.
const PIXELS_PER_FONT_SIZE = 16;
const CENTIMETERS_PER_INCH = 2.54;

const NO_FONT_METRICS = ["WinUI has no font metrics", "write px, or rem (1rem is 16px)"] as const;
const NO_VIEWPORT_VARIANTS = ["WinUI has one window size", "write vw, vh, vmin or vmax inside calc()"] as const;

function build(pixels: number) {
  return {
    kind: LengthUnitKind.BUILD,
    pixels
  } satisfies LengthUnit;
}

const RUNTIME = { kind: LengthUnitKind.RUNTIME } satisfies LengthUnit;

function unsupported([reason, advice]: readonly [string, string]) {
  return {
    kind: LengthUnitKind.UNSUPPORTED,
    reason,
    advice
  } satisfies LengthUnit;
}

/**
 * THE unit table: every length unit CSS has, and what WinUI makes of it. The
 * parser converts the `build` ones, the dynamic-length fold resolves the
 * `runtime` ones, and the validator explains the `unsupported` ones.
 */
export const LENGTH_UNITS: ReadonlyMap<string, LengthUnit> = new Map<string, LengthUnit>([
  ["px", build(1)],
  ["rem", build(PIXELS_PER_FONT_SIZE)],
  ["em", build(PIXELS_PER_FONT_SIZE)],
  ["pt", build(PIXELS_PER_INCH / POINTS_PER_INCH)],
  ["pc", build(PIXELS_PER_INCH / PICAS_PER_INCH)],
  ["in", build(PIXELS_PER_INCH)],
  ["cm", build(PIXELS_PER_INCH / CENTIMETERS_PER_INCH)],
  ["mm", build(PIXELS_PER_INCH / MILLIMETERS_PER_INCH)],
  ["q", build(PIXELS_PER_INCH / QUARTER_MILLIMETERS_PER_INCH)],
  ["%", RUNTIME],
  ["vw", RUNTIME],
  ["vh", RUNTIME],
  ["vmin", RUNTIME],
  ["vmax", RUNTIME],
  ["cqw", RUNTIME],
  ["cqh", RUNTIME],
  ["cqi", RUNTIME],
  ["cqb", RUNTIME],
  ["cqmin", RUNTIME],
  ["cqmax", RUNTIME],
  ["ch", unsupported(NO_FONT_METRICS)],
  ["ex", unsupported(NO_FONT_METRICS)],
  ["cap", unsupported(NO_FONT_METRICS)],
  ["ic", unsupported(NO_FONT_METRICS)],
  ["lh", unsupported(NO_FONT_METRICS)],
  ["rlh", unsupported(NO_FONT_METRICS)],
  ["rch", unsupported(NO_FONT_METRICS)],
  ["rex", unsupported(NO_FONT_METRICS)],
  ["rcap", unsupported(NO_FONT_METRICS)],
  ["ric", unsupported(NO_FONT_METRICS)],
  ["svw", unsupported(NO_VIEWPORT_VARIANTS)],
  ["svh", unsupported(NO_VIEWPORT_VARIANTS)],
  ["lvw", unsupported(NO_VIEWPORT_VARIANTS)],
  ["lvh", unsupported(NO_VIEWPORT_VARIANTS)],
  ["dvw", unsupported(NO_VIEWPORT_VARIANTS)],
  ["dvh", unsupported(NO_VIEWPORT_VARIANTS)],
  ["vi", unsupported(NO_VIEWPORT_VARIANTS)],
  ["vb", unsupported(NO_VIEWPORT_VARIANTS)]
]);

// The units of one kind, longest first (so an alternation tries rem before em).
function unitsOfKind(kind: LengthUnitKind) {
  return [...LENGTH_UNITS]
    .filter(([, unit]) => unit.kind === kind)
    .map(([name]) => name)
    .sort((first, second) => second.length - first.length);
}

const BUILD_UNITS = unitsOfKind(LengthUnitKind.BUILD).join("|");

/** A length in a unit the build converts: the amount, then the unit (absent for a bare number). */
export const BUILD_LENGTH = new RegExp(String.raw`^(-?(?:\d+\.?\d*|\.\d+))(${BUILD_UNITS})?$`, "iu");

/** What a length in `unit` (any case; empty for a bare number) is worth in px. */
export function pixelsPerUnit(unit: string) {
  return LENGTH_UNITS.get(unit.toLowerCase())?.pixels ?? 1;
}

/**
 * The pixels of a lone length in a unit the build converts (`1in`, `12pt`,
 * `2em`); null for anything else, a bare number included. The build hands it to
 * `parseLength` through `provideCalcFolding`, so the window carries no table.
 */
export function convertLength(token: string) {
  const match = BUILD_LENGTH.exec(token.trim());
  const unit = match?.[2] ?? "";
  const isConvertible = match !== null && unit !== "";
  return isConvertible ? Number(match[1]) * pixelsPerUnit(unit) : null;
}
