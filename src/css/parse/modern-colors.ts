// The colors CSS Color 4 adds (hwb, lab, lch, oklab, oklch, color-mix), resolved
// to sRGB at build time: a Style holds a plain color, so the runtime carries no
// parser for them. Out-of-gamut colors are clipped channel by channel.

import { parseColor } from "./colors.ts";
import {
  matchingParenthesis,
  parseNumber,
  parsePercent,
  splitCommas,
  splitSlash,
  splitWords
} from "./values.ts";
import type { NativeValue } from "#src/native-value.js";
import { isRecord } from "#src/renderer/host/reflect.js";
import { readFileSync } from "node:fs";

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

type Triple = readonly [number, number, number];

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const HEX_PAIR = 2;
const HALF_TURN = 180;
const GAMMA_THRESHOLD = 0.0031308;
const GAMMA_SLOPE = 12.92;
const GAMMA_SCALE = 1.055;
const GAMMA_OFFSET = 0.055;
const GAMMA_EXPONENT = 2.4;
const CUBE = 3;
const RGB_DIGITS = 6;
const CHANNELS_AND_ALPHA = 4;
const LAB_DENOMINATOR = 24389;
const LAB_KAPPA_NUMERATOR = 27;
const LAB_EPSILON_NUMERATOR = 216;
const LAB_KAPPA = LAB_DENOMINATOR / LAB_KAPPA_NUMERATOR;
const LAB_EPSILON = LAB_EPSILON_NUMERATOR / LAB_DENOMINATOR;
const LAB_OFFSET = 16;
const LAB_DIVISOR = 116;
const A_DIVISOR = 500;
const B_DIVISOR = 200;
const FUNCTION = /^([a-z][a-z0-9-]*)\((.*)\)$/isu;
const SRGB_SPACE = /^in\s+srgb$/iu;

const matrixFile = new URL("color-matrices.json", import.meta.url);

function isTriple(value: NativeValue): value is Triple {
  return Array.isArray(value) && value.length === CUBE && value.every(item => typeof item === "number");
}

function isMatrix(value: NativeValue): value is Triple[] {
  return Array.isArray(value) && value.every(isTriple);
}

// The conversion matrices, read from color-matrices.json the first time a color needs them.
function matrices() {
  const file: NativeValue = JSON.parse(readFileSync(matrixFile, "utf8"));
  const read = (key: string) => {
    const value = isRecord(file) ? file[key] : undefined;
    if (!isMatrix(value)) {
      throw new TypeError(`${matrixFile.pathname}: ${key} is not a list of triples`);
    }

    return value;
  };
  return {
    d50White: read("d50White")[0] ?? [1, 1, 1],
    xyzD50ToD65: read("xyzD50ToD65"),
    xyzD65ToLinear: read("xyzD65ToLinear"),
    oklabToLms: read("oklabToLms"),
    lmsToLinear: read("lmsToLinear"),
    scales: Object.fromEntries(SCALE_NAMES.map((scale, index) => [scale, read("scales")[index] ?? [1, 1, 1]]))
  };
}

// What a percentage means in each function, per component: `lab(50% ...)` is 50.
const SCALE_NAMES = ["oklab", "oklch", "lab", "lch", "hwb"];

function multiply({ matrix, vector }: {
  matrix: readonly Triple[];
  vector: Triple;
}) {
  const [first = 0, second = 0, third = 0] = matrix.map(row => (
    row[0] * vector[0] + row[1] * vector[1] + row[2] * vector[2]
  ));
  return [first, second, third] as const;
}

function gamma(linear: number) {
  const magnitude = Math.abs(linear);
  const isLinearRange = magnitude <= GAMMA_THRESHOLD;
  const curved = GAMMA_SCALE * magnitude ** (1 / GAMMA_EXPONENT) - GAMMA_OFFSET;
  const encoded = isLinearRange ? GAMMA_SLOPE * magnitude : curved;
  return Math.sign(linear) * encoded;
}

function fromLinear({ linear, alpha }: {
  linear: Triple;
  alpha: number;
}) {
  const [red = 0, green = 0, blue = 0] = linear.map(channel => gamma(channel) * MAX_CHANNEL);
  return {
    red,
    green,
    blue,
    alpha
  } satisfies Rgba;
}

function oklab({ lightness, a, b, alpha }: {
  lightness: number;
  a: number;
  b: number;
  alpha: number;
}) {
  const [long, medium, short] = multiply({
    matrix: matrices().oklabToLms,
    vector: [lightness, a, b]
  });
  return fromLinear({
    linear: multiply({
      matrix: matrices().lmsToLinear,
      vector: [long ** CUBE, medium ** CUBE, short ** CUBE]
    }),
    alpha
  });
}

function expandLab(value: number) {
  const isCubic = value ** CUBE > LAB_EPSILON;
  return isCubic ? value ** CUBE : (LAB_DIVISOR * value - LAB_OFFSET) / LAB_KAPPA;
}

// CIE Lab is relative to D50; the Bradford-adapted matrix takes it to sRGB.
function lab({ lightness, a, b, alpha }: {
  lightness: number;
  a: number;
  b: number;
  alpha: number;
}) {
  const fy = (lightness + LAB_OFFSET) / LAB_DIVISOR;
  const fx = a / A_DIVISOR + fy;
  const fz = fy - b / B_DIVISOR;
  const isCubicLuminance = lightness > LAB_KAPPA * LAB_EPSILON;
  const y = isCubicLuminance ? fy ** CUBE : lightness / LAB_KAPPA;
  const white = matrices().d50White;
  const xyz: Triple = [expandLab(fx) * white[0], y, expandLab(fz) * white[2]];
  return fromLinear({
    linear: multiply({
      matrix: matrices().xyzD65ToLinear,
      vector: multiply({
        matrix: matrices().xyzD50ToD65,
        vector: xyz
      })
    }),
    alpha
  });
}

function polar({ chroma, hue }: {
  chroma: number;
  hue: number;
}) {
  const radians = hue * Math.PI / HALF_TURN;
  return {
    a: chroma * Math.cos(radians),
    b: chroma * Math.sin(radians)
  };
}

function hex(value: number) {
  return Math.round(Math.min(MAX_CHANNEL, Math.max(0, value))).toString(HEX_RADIX).padStart(HEX_PAIR, "0").toUpperCase();
}

function spell({ red, green, blue, alpha }: Rgba) {
  const alphaPart = alpha >= 1 ? "" : hex(alpha * MAX_CHANNEL);
  return `#${alphaPart}${hex(red)}${hex(green)}${hex(blue)}`;
}

// The channels of a color XAML spells (#RRGGBB or #AARRGGBB).
function rgbaOf(color: string) {
  const digits = color.slice(1);
  const offset = digits.length > RGB_DIGITS ? HEX_PAIR : 0;
  const channel = (index: number) => parseInt(digits.substr(offset + index * HEX_PAIR, HEX_PAIR), HEX_RADIX);
  return {
    red: channel(0),
    green: channel(1),
    blue: channel(2),
    alpha: offset === 0 ? 1 : parseInt(digits.slice(0, HEX_PAIR), HEX_RADIX) / MAX_CHANNEL
  } satisfies Rgba;
}

// hwb: the pure hue, mixed with white and black.
function hwb({ hue, whiteness, blackness, alpha }: {
  hue: number;
  whiteness: number;
  blackness: number;
  alpha: number;
}) {
  const sum = whiteness + blackness;
  const scale = sum > 1 ? 1 / sum : 1;
  const base = rgbaOf(parseColor(`hsl(${hue} 100% 50%)`) ?? "#FF0000");
  const fill = 1 - (whiteness + blackness) * scale;
  const mix = (channel: number) => (channel / MAX_CHANNEL * fill + whiteness * scale) * MAX_CHANNEL;
  return {
    red: mix(base.red),
    green: mix(base.green),
    blue: mix(base.blue),
    alpha
  } satisfies Rgba;
}

// A component: a number, a percentage of `scale`, or `none` (0).
function component({ text, scale }: {
  text: string | undefined;
  scale: number;
}) {
  const isMissing = text === undefined;
  if (isMissing) {
    return null;
  }

  const isNone = text.toLowerCase() === "none";
  if (isNone) {
    return 0;
  }

  const percent = parsePercent(text);
  return percent === null ? parseNumber(text.replace(/deg$/iu, "")) : percent * scale;
}

function functionColor({ name, body }: {
  name: string;
  body: string;
}) {
  const scales = SCALE_NAMES.includes(name) ? matrices().scales[name] : undefined;
  const [channels = "", alphaText] = splitSlash(body);
  const words = splitWords(channels);
  const isShaped = scales !== undefined && words.length === CUBE;
  if (!isShaped) {
    return null;
  }

  const [first, second, third] = words.map((text, index) => component({
    text,
    scale: scales[index] ?? 1
  }));
  const alpha = alphaText === undefined ? 1 : component({
    text: alphaText,
    scale: 1
  });
  const numbers = [first, second, third, alpha].filter(isNumber);
  const [hue, chromaOrWhite, hueOrBlack, opacity] = numbers;
  const isReadable = numbers.length === CHANNELS_AND_ALPHA;
  if (!isReadable) {
    return null;
  }

  return build({
    name,
    first: hue ?? 0,
    second: chromaOrWhite ?? 0,
    third: hueOrBlack ?? 0,
    alpha: opacity ?? 1
  });
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number";
}

function build({ name, first, second, third, alpha }: {
  name: string;
  first: number;
  second: number;
  third: number;
  alpha: number;
}) {
  const isHwb = name === "hwb";
  if (isHwb) {
    return hwb({
      hue: first,
      whiteness: Math.min(1, Math.max(0, second)),
      blackness: Math.min(1, Math.max(0, third)),
      alpha
    });
  }

  const isPolar = name.endsWith("ch");
  const axes = isPolar ? polar({
    chroma: second,
    hue: third
  }) : {
    a: second,
    b: third
  };
  const convert = name.startsWith("ok") ? oklab : lab;
  return convert({
    lightness: first,
    ...axes,
    alpha
  });
}

// A color a color-mix may mix: the functions without color-mix, or any parseColor reads.
function plainColor(token: string) {
  const match = FUNCTION.exec(token.trim());
  const rgba = functionColor({
    name: match?.[1]?.toLowerCase() ?? "",
    body: match?.[2] ?? ""
  });
  return rgba === null ? parseColor(token.trim()) : spell(rgba);
}

// One color of a color-mix and its percentage, if it has one.
function mixPart(text: string) {
  const words = splitWords(text);
  const percent = parsePercent(words.at(-1) ?? "");
  const color = (percent === null ? words : words.slice(0, -1)).join(" ");
  const resolved = plainColor(color);
  return resolved === null ? null : {
    rgba: rgbaOf(resolved),
    weight: percent
  };
}

// color-mix(in srgb, red 30%, blue): two colors and optional percentages.
function mixed(body: string) {
  const [space = "", firstText = "", secondText = "", ...rest] = splitCommas(body);
  const first = mixPart(firstText);
  const second = mixPart(secondText);
  const isMixable = SRGB_SPACE.test(space) && rest.length === 0 && first !== null && second !== null;
  if (!isMixable) {
    return null;
  }

  const firstWeight = first.weight ?? (second.weight === null ? 1 / HEX_PAIR : 1 - second.weight);
  const secondWeight = second.weight ?? 1 - firstWeight;
  const total = firstWeight + secondWeight;
  const isEmptyMix = total <= 0;
  if (isEmptyMix) {
    return null;
  }

  const blend = (pick: (rgba: Rgba) => number) => (
    (pick(first.rgba) * firstWeight + pick(second.rgba) * secondWeight) / total
  );
  return {
    red: blend(rgba => rgba.red),
    green: blend(rgba => rgba.green),
    blue: blend(rgba => rgba.blue),
    alpha: blend(rgba => rgba.alpha) * Math.min(1, total)
  } satisfies Rgba;
}

const MODERN_CALL = /(?<![\w-])(?:oklch|oklab|lch|lab|hwb|color-mix)\(/giu;

/**
 * A declaration value with every modern color function in it replaced by the
 * sRGB color it comes to; one that cannot be read is left as written, for the
 * property's own parser to report.
 */
export function resolveModernColors(value: string) {
  let result = "";
  let index = 0;
  for (const match of value.matchAll(MODERN_CALL)) {
    const isInsideEarlier = match.index < index;
    const end = isInsideEarlier ? value.length : matchingParenthesis({
      text: value,
      open: match.index + match[0].length - 1
    });
    const isUnclosed = end >= value.length;
    if (isUnclosed) {
      continue;
    }

    const call = value.slice(match.index, end + 1);
    result += value.slice(index, match.index) + (resolveModernColor(call) ?? call);
    index = end + 1;
  }

  return result + value.slice(index);
}

/**
 * A color as XAML spells it, for the CSS Color 4 functions (`oklch()`, `oklab()`,
 * `lab()`, `lch()`, `hwb()` and `color-mix(in srgb, a, b)`) and for every color
 * `parseColor` reads; null when the token is neither.
 */
export function resolveModernColor(token: string) {
  const match = FUNCTION.exec(token.trim());
  const name = match?.[1]?.toLowerCase() ?? "";
  const body = match?.[2] ?? "";
  const rgba = name === "color-mix" ? mixed(body) : functionColor({
    name,
    body
  });
  return rgba === null ? parseColor(token.trim()) : spell(rgba);
}
