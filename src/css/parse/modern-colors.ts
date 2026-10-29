// The colors CSS Color 4 adds (hwb, lab, lch, oklab, oklch, color-mix, relative
// color syntax), resolved to sRGB at build time: a Style holds a plain color, so
// the runtime carries no parser for them. Out-of-gamut colors are clipped
// channel by channel.

import { evaluateNumberCalc } from "./calc.ts";
import { convertColor, hueIndex, Space } from "./color-spaces.ts";
import type { Color, Triple } from "./color-spaces.ts";
import { parseColor } from "./colors.ts";
import { matchingParenthesis, splitCommas, splitSlash, splitWords } from "./split.ts";
import { parseNumber, parsePercent } from "./values.ts";

/** The custom properties the sheet defines, by name, for a relative color whose origin is a `var()`. */
export type VariableLookup = ReadonlyMap<string, string>;

/** A color function: its space, the channel keywords of relative syntax, and the size of a percentage. */
interface FunctionSpec {
  space: Space;
  keywords: readonly [string, string, string];
  /** What 100% of each channel is, in the CSS unit of the channel. */
  scales: Triple;
  /** How many CSS units one natural unit of each channel is (rgb is 0 to 255, hsl's s and l are 0 to 100). */
  units: Triple;
}

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const HEX_PAIR = 2;
const PERCENT = 100;
const FULL_TURN = 360;
const HALF = 1 / 2;
const HALF_TURN = FULL_TURN * HALF;
const LAB_AB_RANGE = 125;
const LCH_CHROMA_RANGE = 150;
const OKLAB_AB_RANGE = 0.4;
const RGB_DIGITS = 6;
const CHANNEL_COUNT = 3;
const SPECS = new Map<string, FunctionSpec>([
  ["rgb", {
    space: Space.SRGB,
    keywords: ["r", "g", "b"],
    scales: [MAX_CHANNEL, MAX_CHANNEL, MAX_CHANNEL],
    units: [MAX_CHANNEL, MAX_CHANNEL, MAX_CHANNEL]
  }],
  ["hsl", {
    space: Space.HSL,
    keywords: ["h", "s", "l"],
    scales: [FULL_TURN, PERCENT, PERCENT],
    units: [1, PERCENT, PERCENT]
  }],
  ["hwb", {
    space: Space.HWB,
    keywords: ["h", "w", "b"],
    scales: [FULL_TURN, PERCENT, PERCENT],
    units: [1, PERCENT, PERCENT]
  }],
  ["lab", {
    space: Space.LAB,
    keywords: ["l", "a", "b"],
    scales: [PERCENT, LAB_AB_RANGE, LAB_AB_RANGE],
    units: [1, 1, 1]
  }],
  ["lch", {
    space: Space.LCH,
    keywords: ["l", "c", "h"],
    scales: [PERCENT, LCH_CHROMA_RANGE, FULL_TURN],
    units: [1, 1, 1]
  }],
  ["oklab", {
    space: Space.OKLAB,
    keywords: ["l", "a", "b"],
    scales: [1, OKLAB_AB_RANGE, OKLAB_AB_RANGE],
    units: [1, 1, 1]
  }],
  ["oklch", {
    space: Space.OKLCH,
    keywords: ["l", "c", "h"],
    scales: [1, OKLAB_AB_RANGE, FULL_TURN],
    units: [1, 1, 1]
  }]
]);
const MIX_SPACES = new Map<string, Space>([
  ["srgb", Space.SRGB],
  ["srgb-linear", Space.SRGB_LINEAR],
  ["xyz", Space.XYZ],
  ["xyz-d65", Space.XYZ],
  ["xyz-d50", Space.XYZ_D50],
  ["lab", Space.LAB],
  ["lch", Space.LCH],
  ["oklab", Space.OKLAB],
  ["oklch", Space.OKLCH],
  ["hsl", Space.HSL],
  ["hwb", Space.HWB]
]);
const FUNCTION = /^([a-z][a-z0-9-]*)\((.*)\)$/isu;
const RELATIVE = /^from\s+/iu;
const MIX_HEAD = /^in\s+([a-z0-9-]+)(?:\s+(shorter|longer|increasing|decreasing)\s+hue)?$/iu;
const MODERN_CALL = /(?<![\w-])(?:oklch|oklab|lch|lab|hwb|color-mix|(?:rgba?|hsla?)(?=\(\s*from\s))\(/giu;
const VARIABLE = /var\(\s*(--[\w-]+)\s*\)/gu;

function hex(value: number) {
  return Math.round(Math.min(MAX_CHANNEL, Math.max(0, value))).toString(HEX_RADIX).padStart(HEX_PAIR, "0").toUpperCase();
}

function spell(color: Color) {
  const [red, green, blue] = convertColor({
    color,
    space: Space.SRGB
  }).channels;
  const alphaPart = color.alpha >= 1 ? "" : hex(color.alpha * MAX_CHANNEL);
  return `#${alphaPart}${hex(red * MAX_CHANNEL)}${hex(green * MAX_CHANNEL)}${hex(blue * MAX_CHANNEL)}`;
}

// The sRGB color of a token parseColor reads.
function plainColor(token: string) {
  const xaml = parseColor(token.trim());
  const isUnreadable = xaml === null;
  if (isUnreadable) {
    return null;
  }

  const digits = xaml.slice(1);
  const offset = digits.length > RGB_DIGITS ? HEX_PAIR : 0;
  function channel(index: number) {
    const start = offset + index * HEX_PAIR;
    return Number.parseInt(digits.slice(start, start + HEX_PAIR), HEX_RADIX) / MAX_CHANNEL;
  }

  return {
    space: Space.SRGB,
    channels: [channel(0), channel(1), channel(2)],
    alpha: offset === 0 ? 1 : Number.parseInt(digits.slice(0, HEX_PAIR), HEX_RADIX) / MAX_CHANNEL
  } satisfies Color;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === "number";
}

// A channel written as a number, a percentage of `scale`, `none`, or a keyword of the origin color.
function channelValue({ text, scale, known }: {
  text: string;
  scale: number;
  known: ReadonlyMap<string, number>;
}) {
  const word = text.trim().toLowerCase();
  const isNone = word === "none";
  if (isNone) {
    return 0;
  }

  const keyword = known.get(word);
  const isKeyword = keyword !== undefined;
  if (isKeyword) {
    return keyword;
  }

  const percent = parsePercent(word);
  const isPercent = percent !== null;
  if (isPercent) {
    return percent * scale;
  }

  const number = parseNumber(word.replace(/deg$/u, ""));
  const isNumeric = number !== null;
  if (isNumeric) {
    return number;
  }

  const isCalc = word.startsWith("calc(");
  const substituted = word.replaceAll(/[a-z]+/gu, name => String(known.get(name) ?? name));
  return isCalc ? evaluateNumberCalc(substituted) : null;
}

function colorFromChannels({ spec, texts, alphaText, known }: {
  spec: FunctionSpec;
  texts: readonly string[];
  alphaText: string | undefined;
  known: ReadonlyMap<string, number>;
}) {
  const values = texts.map((text, index) => channelValue({
    text,
    scale: spec.scales[index] ?? 1,
    known
  }));
  const alpha = alphaText === undefined ? 1 : channelValue({
    text: alphaText,
    scale: 1,
    known
  });
  const [first, second, third] = values;
  const isShaped = values.length === CHANNEL_COUNT;
  const hasEvery = isNumber(first) && isNumber(second) && isNumber(third) && isNumber(alpha);
  const isReadable = isShaped && hasEvery;
  if (!isReadable) {
    return null;
  }

  const [unitFirst, unitSecond, unitThird] = spec.units;
  return {
    space: spec.space,
    channels: [first / unitFirst, second / unitSecond, third / unitThird],
    alpha
  } satisfies Color;
}

function originColor({ text, resolver }: {
  text: string;
  resolver: Resolver;
}) {
  const substituted = text.replaceAll(VARIABLE, (whole, name: string) => resolver.lookup.get(name) ?? whole);
  return resolver.color(substituted);
}

// `fn(from <origin> channels / alpha)`: the origin's channels, by keyword, in the function's units.
function relativeColor({ spec, body, resolver }: {
  spec: FunctionSpec;
  body: string;
  resolver: Resolver;
}) {
  const [channels = "", alphaText] = splitSlash(body.replace(RELATIVE, ""));
  const words = splitWords(channels);
  const [origin = "", ...texts] = words;
  const base = originColor({
    text: origin,
    resolver
  });
  const isMissing = base === null;
  if (isMissing) {
    return null;
  }

  const { channels: natural, alpha } = convertColor({
    color: base,
    space: spec.space
  });
  const known = new Map<string, number>([
    ...spec.keywords.map((keyword, index) => [keyword, (natural[index] ?? 0) * (spec.units[index] ?? 1)] as const),
    ["alpha", alpha]
  ]);
  return colorFromChannels({
    spec,
    texts,
    alphaText,
    known
  });
}

function functionColor({ name, body, resolver }: {
  name: string;
  body: string;
  resolver: Resolver;
}) {
  const spec = SPECS.get(name);
  const isUnknown = spec === undefined;
  if (isUnknown) {
    return null;
  }

  if (RELATIVE.test(body)) {
    return relativeColor({
      spec,
      body,
      resolver
    });
  }

  const [channels = "", alphaText] = splitSlash(body);
  return colorFromChannels({
    spec,
    texts: splitWords(channels),
    alphaText,
    known: new Map()
  });
}

// How far each hue is turned (in degrees) so the interpolation goes the way the method says.
const HUE_ADJUSTMENTS = new Map<string, (gap: number) => readonly [number, number]>([
  ["shorter", gap => {
    const isFarForward = gap > HALF_TURN;
    const isFarBack = gap < -HALF_TURN;
    return [isFarForward ? FULL_TURN : 0, isFarBack ? FULL_TURN : 0];
  }],
  ["longer", gap => {
    const isNearForward = gap > 0 && gap < HALF_TURN;
    const isNearBack = gap <= 0 && gap > -HALF_TURN;
    return [isNearForward ? FULL_TURN : 0, isNearBack ? FULL_TURN : 0];
  }],
  ["increasing", gap => [0, gap < 0 ? FULL_TURN : 0]],
  ["decreasing", gap => [gap > 0 ? FULL_TURN : 0, 0]]
]);

// Interpolates two hues (degrees) by the method; the result is in 0 to 360.
function mixHue({ first, second, method, weight }: {
  first: number;
  second: number;
  method: string;
  weight: number;
}) {
  const [fromTurn, toTurn] = HUE_ADJUSTMENTS.get(method)?.(second - first) ?? [0, 0];
  const from = first + fromTurn;
  const to = second + toTurn;
  return ((from * (1 - weight) + to * weight) % FULL_TURN + FULL_TURN) % FULL_TURN;
}

// One color of a color-mix and its percentage, if it has one.
function mixPart({ text, resolver }: {
  text: string;
  resolver: Resolver;
}) {
  const words = splitWords(text);
  const percent = parsePercent(words.at(-1) ?? "");
  const color = resolver.color((percent === null ? words : words.slice(0, -1)).join(" "));
  return color === null ? null : {
    color,
    weight: percent
  };
}

function mixed({ body, resolver }: {
  body: string;
  resolver: Resolver;
}) {
  const [head = "", firstText = "", secondText = "", ...rest] = splitCommas(body);
  const header = MIX_HEAD.exec(head.trim());
  const space = MIX_SPACES.get((header?.[1] ?? "").toLowerCase());
  const first = mixPart({
    text: firstText,
    resolver
  });
  const second = mixPart({
    text: secondText,
    resolver
  });
  const isMixable = space !== undefined && rest.length === 0 && first !== null && second !== null;
  if (!isMixable) {
    return null;
  }

  const firstWeight = first.weight ?? (second.weight === null ? HALF : 1 - second.weight);
  const secondWeight = second.weight ?? 1 - firstWeight;
  const total = firstWeight + secondWeight;
  const isEmpty = total <= 0;
  if (isEmpty) {
    return null;
  }

  return interpolate({
    colors: [
      convertColor({
        color: first.color,
        space
      }),
      convertColor({
        color: second.color,
        space
      })
    ],
    weights: [firstWeight / total, secondWeight / total],
    method: (header?.[2] ?? "shorter").toLowerCase(),
    opacity: Math.min(1, total)
  });
}

// Premultiplied-alpha interpolation of two colors in the same space.
function interpolate({ colors, weights, method, opacity }: {
  colors: readonly [Color, Color];
  weights: readonly [number, number];
  method: string;
  opacity: number;
}) {
  const [first, second] = colors;
  const [firstWeight, secondWeight] = weights;
  const { space } = first;
  const alpha = first.alpha * firstWeight + second.alpha * secondWeight;
  const hue = hueIndex(space);
  const divisor = alpha === 0 ? 1 : alpha;
  const channels = first.channels.map((channel, index) => {
    const other = second.channels[index] ?? 0;
    const isHue = index === hue;
    if (isHue) {
      return mixHue({
        first: channel,
        second: other,
        method,
        weight: secondWeight
      });
    }

    return (channel * first.alpha * firstWeight + other * second.alpha * secondWeight) / divisor;
  });
  const [one = 0, two = 0, three = 0] = channels;
  return {
    space,
    channels: [one, two, three],
    alpha: alpha * opacity
  } satisfies Color;
}

/** What nested colors are read with: the sheet's custom properties, and this resolution again. */
interface Resolver {
  lookup: VariableLookup;
  color(token: string): Color | null;
}

function createResolver(lookup: VariableLookup) {
  const resolver: Resolver = {
    lookup,
    color: token => colorOf({
      token,
      resolver
    })
  };
  return resolver;
}

function colorOf({ token, resolver }: {
  token: string;
  resolver: Resolver;
}) {
  const match = FUNCTION.exec(token.trim());
  const name = match?.[1]?.toLowerCase() ?? "";
  const body = match?.[2] ?? "";
  const isMix = name === "color-mix";
  const modern = isMix ? mixed({
    body,
    resolver
  }) : functionColor({
    name,
    body,
    resolver
  });
  return modern ?? plainColor(token);
}

/**
 * A color as XAML spells it, for the CSS Color 4 functions (`oklch()`, `oklab()`,
 * `lab()`, `lch()`, `hwb()`), `color-mix()` in any of srgb, srgb-linear, xyz,
 * lab, lch, oklab, oklch, hsl and hwb (with a hue interpolation method), and
 * relative colors (`rgb(from var(--c) r g b / 50%)`), whose origin is a color or
 * a `var()` of `lookup`; and for every color `parseColor` reads. Null when the
 * token is none of them or cannot be read.
 */
export function resolveModernColor({ token, lookup = new Map() }: {
  token: string;
  lookup?: VariableLookup;
}) {
  const color = createResolver(lookup).color(token);
  return color === null ? null : spell(color);
}

/**
 * A declaration value with every modern color function in it replaced by the
 * sRGB color it comes to; one that cannot be read is left as written, for the
 * property's own parser to report.
 */
export function resolveModernColors({ value, lookup = new Map() }: {
  value: string;
  lookup?: VariableLookup;
}) {
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
    result += value.slice(index, match.index) + (resolveModernColor({
      token: call,
      lookup
    }) ?? call);
    index = end + 1;
  }

  return result + value.slice(index);
}
