// Converting a color between the spaces CSS Color 4 names, through linear sRGB.
// Build time only: the matrices are read from color-matrices.json when needed.

import type { NativeValue } from "#src/native-value.js";
import { isRecord } from "#src/renderer/host/reflect.js";
import { readFileSync } from "node:fs";

/** The spaces `color-mix()` and the color functions work in. */
export const Space = {
  SRGB: "srgb",
  SRGB_LINEAR: "srgb-linear",
  XYZ: "xyz",
  XYZ_D50: "xyz-d50",
  LAB: "lab",
  LCH: "lch",
  OKLAB: "oklab",
  OKLCH: "oklch",
  HSL: "hsl",
  HWB: "hwb"
} as const;

/** One of the spaces in `Space`. */
export type Space = (typeof Space)[keyof typeof Space];

/** Three channels in their space's own units (see `Color`). */
export type Triple = readonly [number, number, number];

/**
 * A color in a space. The channels are: srgb and srgb-linear, red green blue in
 * 0 to 1; xyz and xyz-d50, X Y Z; lab and lch, lightness 0 to 100 and a b or
 * chroma hue; oklab and oklch, lightness 0 to 1 and a b or chroma hue; hsl,
 * hue in degrees then saturation and lightness in 0 to 1; hwb, hue then
 * whiteness and blackness in 0 to 1.
 */
export interface Color {
  space: Space;
  channels: Triple;
  alpha: number;
}

const GAMMA_THRESHOLD = 0.04045;
const GAMMA_ENCODED_THRESHOLD = 0.0031308;
const GAMMA_SLOPE = 12.92;
const GAMMA_SCALE = 1.055;
const GAMMA_OFFSET = 0.055;
const GAMMA_EXPONENT = 2.4;
const CUBE = 3;
const HALF_TURN = 180;
const FULL_TURN = 360;
const HUE_SECTORS = 6;
const HUE_STEP = 30;
const BLUE_SECTOR = 4;
const HUE_WRAP = 12;
const HSL_PEAK = 9;
const RED_OFFSET = 0;
const GREEN_OFFSET = 8;
const BLUE_OFFSET = 4;
const SECTOR_DEGREES = 60;
const LAB_DENOMINATOR = 24389;
const LAB_KAPPA_NUMERATOR = 27;
const LAB_EPSILON_NUMERATOR = 216;
const LAB_KAPPA = LAB_DENOMINATOR / LAB_KAPPA_NUMERATOR;
const LAB_EPSILON = LAB_EPSILON_NUMERATOR / LAB_DENOMINATOR;
const LAB_OFFSET = 16;
const LAB_DIVISOR = 116;
const A_DIVISOR = 500;
const B_DIVISOR = 200;
const ACHROMATIC = 1e-7;
const matrixFile = new URL("color-matrices.json", import.meta.url);

function isTriple(value: NativeValue): value is Triple {
  return Array.isArray(value) && value.length === CUBE && value.every(item => typeof item === "number");
}

function isMatrix(value: NativeValue): value is Triple[] {
  return Array.isArray(value) && value.every(isTriple);
}

// The conversion matrices, read from color-matrices.json each time a conversion needs them.
function matrices() {
  const file: NativeValue = JSON.parse(readFileSync(matrixFile, "utf8"));
  function read(key: string) {
    const value = isRecord(file) ? file[key] : undefined;
    if (!isMatrix(value)) {
      throw new TypeError(`${matrixFile.pathname}: ${key} is not a list of triples`);
    }

    return value;
  }

  return {
    d50White: read("d50White")[0] ?? [1, 1, 1],
    xyzD50ToD65: read("xyzD50ToD65"),
    xyzD65ToD50: read("xyzD65ToD50"),
    xyzToLinear: read("xyzD65ToLinear"),
    linearToXyz: read("linearToXyz"),
    oklabToLms: read("oklabToLms"),
    lmsToLinear: read("lmsToLinear"),
    linearToLms: read("linearToLms"),
    lmsToOklab: read("lmsToOklab")
  };
}

function multiply({ matrix, vector }: {
  matrix: readonly Triple[];
  vector: Triple;
}) {
  const [first = 0, second = 0, third = 0] = matrix.map(row => (
    row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]
  ));
  return [first, second, third] as const;
}

function decode(value: number) {
  const magnitude = Math.abs(value);
  const isLinearRange = magnitude <= GAMMA_THRESHOLD;
  const curved = ((magnitude + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA_EXPONENT;
  return Math.sign(value) * (isLinearRange ? magnitude / GAMMA_SLOPE : curved);
}

function encode(value: number) {
  const magnitude = Math.abs(value);
  const isLinearRange = magnitude <= GAMMA_ENCODED_THRESHOLD;
  const curved = GAMMA_SCALE * magnitude ** (1 / GAMMA_EXPONENT) - GAMMA_OFFSET;
  return Math.sign(value) * (isLinearRange ? GAMMA_SLOPE * magnitude : curved);
}

function mapTriple({ triple, map }: {
  triple: Triple;
  map(value: number): number;
}) {
  return [map(triple[0]), map(triple[1]), map(triple[2])] as const;
}

function toDegrees(radians: number) {
  const degrees = radians * HALF_TURN / Math.PI;
  return (degrees % FULL_TURN + FULL_TURN) % FULL_TURN;
}

function fromPolar([lightness, chroma, hue]: Triple) {
  const radians = hue * Math.PI / HALF_TURN;
  return [lightness, chroma * Math.cos(radians), chroma * Math.sin(radians)] as const;
}

function toPolar([lightness, axisA, axisB]: Triple) {
  const chroma = Math.hypot(axisA, axisB);
  const isGray = chroma < ACHROMATIC;
  return [lightness, chroma, isGray ? 0 : toDegrees(Math.atan2(axisB, axisA))] as const;
}

function hslToSrgb([hue, saturation, lightness]: Triple) {
  const amount = saturation * Math.min(lightness, 1 - lightness);
  function channel(offset: number) {
    const position = (offset + hue / HUE_STEP) % HUE_WRAP;
    return lightness - amount * Math.max(-1, Math.min(position - CUBE, HSL_PEAK - position, 1));
  }

  return [channel(RED_OFFSET), channel(GREEN_OFFSET), channel(BLUE_OFFSET)] as const;
}

function srgbToHsl([red, green, blue]: Triple) {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;
  const isGray = delta < ACHROMATIC;
  if (isGray) {
    return [0, 0, lightness] as const;
  }

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  const hueByMax = new Map([
    [red, (green - blue) / delta + (green < blue ? HUE_SECTORS : 0)],
    [green, (blue - red) / delta + 2],
    [blue, (red - green) / delta + BLUE_SECTOR]
  ]);
  return [(hueByMax.get(max) ?? 0) * SECTOR_DEGREES, saturation, lightness] as const;
}

function hwbToSrgb([hue, whiteness, blackness]: Triple) {
  const sum = whiteness + blackness;
  const scale = sum > 1 ? 1 / sum : 1;
  const base = hslToSrgb([hue, 1, 1 / 2]);
  const fill = 1 - (whiteness + blackness) * scale;
  return mapTriple({
    triple: base,
    map: channel => channel * fill + whiteness * scale
  });
}

function srgbToHwb(rgb: Triple) {
  const [hue] = srgbToHsl(rgb);
  return [hue, Math.min(...rgb), 1 - Math.max(...rgb)] as const;
}

function expandLab(value: number) {
  const isCubic = value ** CUBE > LAB_EPSILON;
  return isCubic ? value ** CUBE : (LAB_DIVISOR * value - LAB_OFFSET) / LAB_KAPPA;
}

function labToXyzD50([lightness, axisA, axisB]: Triple) {
  const scaledY = (lightness + LAB_OFFSET) / LAB_DIVISOR;
  const scaledX = axisA / A_DIVISOR + scaledY;
  const scaledZ = scaledY - axisB / B_DIVISOR;
  const isCubicLuminance = lightness > LAB_KAPPA * LAB_EPSILON;
  const white = matrices().d50White;
  return [
    expandLab(scaledX) * white[0],
    isCubicLuminance ? scaledY ** CUBE : lightness / LAB_KAPPA,
    expandLab(scaledZ) * white[2]
  ] as const;
}

function compressLab(value: number) {
  const isCubic = value > LAB_EPSILON;
  return isCubic ? Math.cbrt(value) : (LAB_KAPPA * value + LAB_OFFSET) / LAB_DIVISOR;
}

function xyzD50ToLab(xyz: Triple) {
  const white = matrices().d50White;
  const scaledX = compressLab(xyz[0] / white[0]);
  const scaledY = compressLab(xyz[1]);
  const scaledZ = compressLab(xyz[2] / white[2]);
  return [
    LAB_DIVISOR * scaledY - LAB_OFFSET,
    A_DIVISOR * (scaledX - scaledY),
    B_DIVISOR * (scaledY - scaledZ)
  ] as const;
}

function oklabToLinear(oklab: Triple) {
  const { oklabToLms, lmsToLinear } = matrices();
  const lms = multiply({
    matrix: oklabToLms,
    vector: oklab
  });
  return multiply({
    matrix: lmsToLinear,
    vector: mapTriple({
      triple: lms,
      map: channel => channel ** CUBE
    })
  });
}

function linearToOklab(linear: Triple) {
  const { linearToLms, lmsToOklab } = matrices();
  const lms = multiply({
    matrix: linearToLms,
    vector: linear
  });
  return multiply({
    matrix: lmsToOklab,
    vector: mapTriple({
      triple: lms,
      map: Math.cbrt
    })
  });
}

function xyzToLinear(xyz: Triple) {
  return multiply({
    matrix: matrices().xyzToLinear,
    vector: xyz
  });
}

function xyzD50ToLinear(xyz: Triple) {
  return xyzToLinear(
    multiply({
      matrix: matrices().xyzD50ToD65,
      vector: xyz
    })
  );
}

function linearToXyz(linear: Triple) {
  return multiply({
    matrix: matrices().linearToXyz,
    vector: linear
  });
}

function linearToXyzD50(linear: Triple) {
  return multiply({
    matrix: matrices().xyzD65ToD50,
    vector: linearToXyz(linear)
  });
}

function toLinear({ space, channels }: Color) {
  const toLinearByColorSpace = new Map<Space, () => Triple>([
    [Space.SRGB, () => mapTriple({
      triple: channels,
      map: decode
    })],
    [Space.SRGB_LINEAR, () => channels],
    [Space.XYZ, () => xyzToLinear(channels)],
    [Space.XYZ_D50, () => xyzD50ToLinear(channels)],
    [Space.LAB, () => xyzD50ToLinear(labToXyzD50(channels))],
    [Space.LCH, () => xyzD50ToLinear(labToXyzD50(fromPolar(channels)))],
    [Space.OKLAB, () => oklabToLinear(channels)],
    [Space.OKLCH, () => oklabToLinear(fromPolar(channels))],
    [Space.HSL, () => mapTriple({
      triple: hslToSrgb(channels),
      map: decode
    })],
    [Space.HWB, () => mapTriple({
      triple: hwbToSrgb(channels),
      map: decode
    })]
  ]);
  return toLinearByColorSpace.get(space)?.() ?? channels;
}

function fromLinear({ linear, space }: {
  linear: Triple;
  space: Space;
}) {
  function encoded() {
    return mapTriple({
      triple: linear,
      map: encode
    });
  }

  const fromLinearByColorSpace = new Map<Space, () => Triple>([
    [Space.SRGB, encoded],
    [Space.SRGB_LINEAR, () => linear],
    [Space.XYZ, () => linearToXyz(linear)],
    [Space.XYZ_D50, () => linearToXyzD50(linear)],
    [Space.LAB, () => xyzD50ToLab(linearToXyzD50(linear))],
    [Space.LCH, () => toPolar(xyzD50ToLab(linearToXyzD50(linear)))],
    [Space.OKLAB, () => linearToOklab(linear)],
    [Space.OKLCH, () => toPolar(linearToOklab(linear))],
    [Space.HSL, () => srgbToHsl(encoded())],
    [Space.HWB, () => srgbToHwb(encoded())]
  ]);
  return fromLinearByColorSpace.get(space)?.() ?? linear;
}

/** The same color in another space (channels may fall outside the space's gamut). */
export function convertColor({ color, space }: {
  color: Color;
  space: Space;
}) {
  const isSame = color.space === space;
  if (isSame) {
    return color;
  }

  return {
    space,
    channels: fromLinear({
      linear: toLinear(color),
      space
    }),
    alpha: color.alpha
  } satisfies Color;
}

/** The index of a space's hue channel, or null when it has none. */
export function hueIndex(space: Space) {
  const indexes = new Map<Space, number>([
    [Space.HSL, 0],
    [Space.HWB, 0],
    [Space.LCH, 2],
    [Space.OKLCH, 2]
  ]);
  return indexes.get(space) ?? null;
}
