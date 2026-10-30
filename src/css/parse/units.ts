/** What WinUI makes of a CSS unit. */
export const LengthUnitKind = {
  /** WinUI reads it as it is written: there is no conversion. */
  NATIVE: "native",
  /** Has no WinUI meaning; the build fails and says what to write. */
  UNSUPPORTED: "unsupported"
} as const;

/** One of the kinds in `LengthUnitKind`. */
export type LengthUnitKind = (typeof LengthUnitKind)[keyof typeof LengthUnitKind];

/** How a unit is treated. */
export interface LengthUnit {
  kind: LengthUnitKind;
  /** What a native unit measures. */
  measures?: string;
  /** Why an `unsupported` unit has no meaning. */
  reason?: string;
  /** What to write instead, for an `unsupported` unit. */
  advice?: string;
}

function native(measures: string) {
  return {
    kind: LengthUnitKind.NATIVE,
    measures
  } satisfies LengthUnit;
}

function unsupported({ unit, reason, advice }: {
  unit: string;
  reason: string;
  advice: string;
}) {
  return [unit, {
    kind: LengthUnitKind.UNSUPPORTED,
    reason,
    advice
  }] as const satisfies readonly [string, LengthUnit];
}

function unsupportedAll({ units, reason, advice }: {
  units: readonly string[];
  reason: string;
  advice: (unit: string) => string;
}) {
  return units.map(unit => unsupported({
    unit,
    reason,
    advice: advice(unit)
  }));
}

const FONT_RELATIVE = ["rem", "em", "ch", "ex", "cap", "ic", "lh", "rlh", "rch", "rex", "rcap", "ric"];
const ABSOLUTE = ["pt", "pc", "in", "cm", "mm", "q"];
const VIEWPORT = ["vw", "vh", "vmin", "vmax", "vi", "vb", "svw", "svh", "svi", "svb", "lvw", "lvh", "lvi", "lvb", "dvw", "dvh", "dvi", "dvb"];
const CONTAINER = ["cqw", "cqh", "cqi", "cqb", "cqmin", "cqmax"];
const ANGLES = ["rad", "grad", "turn"];
const RESOLUTIONS = ["dppx", "dpi", "dpcm", "x"];

/**
 * THE unit table: the units WinUI understands as they are written, and for
 * every other CSS unit the reason and what to write instead. The parser, the
 * validator, the stylelint rule and the VS Code data all read it.
 */
export const LENGTH_UNITS: ReadonlyMap<string, LengthUnit> = new Map<string, LengthUnit>([
  ["px", native("length: device-independent pixels, as WinUI measures")],
  ["deg", native("angle: degrees, as WinUI rotates, skews and aims gradients")],
  ["s", native("time: seconds, as WinUI's Duration and TimeSpan")],
  ["ms", native("time: milliseconds, as WinUI's Duration and TimeSpan")],
  ["fr", native("grid track: a star-sized share of the rest")],
  ...unsupportedAll({
    units: FONT_RELATIVE,
    reason: "WinUI has no relative font units",
    advice: unit => `WinUI has no ${unit} unit: write px`
  }),
  ...unsupportedAll({
    units: ABSOLUTE,
    reason: "WinUI measures only in device-independent pixels",
    advice: unit => `WinUI has no ${unit} unit: write px`
  }),
  ...unsupportedAll({
    units: VIEWPORT,
    reason: "WinUI has no viewport units",
    advice: unit => `WinUI has no ${unit} unit: write px, or size the element with a Grid star track or stretch alignment`
  }),
  ...unsupportedAll({
    units: CONTAINER,
    reason: "WinUI has no container units",
    advice: unit => `WinUI has no ${unit} unit: write px, or size the element with a Grid star track or stretch alignment`
  }),
  ...unsupportedAll({
    units: ANGLES,
    reason: "WinUI angles are degrees",
    advice: unit => `WinUI has no ${unit} unit: write deg`
  }),
  ...unsupportedAll({
    units: RESOLUTIONS,
    reason: "a resolution is a media feature, not a length",
    advice: unit => `WinUI has no ${unit} unit: write px`
  }),
  unsupported({
    unit: "%",
    reason: "WinUI has no percentage lengths",
    advice: "WinUI has no % unit in a length: write px, or use a Grid star track or stretch alignment, or compute it in script"
  })
]);
