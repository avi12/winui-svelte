import { pixelsOf, splitTopLevel } from "./css-split.ts";

export const BoxKind = {
  SIDES: "sides",
  CORNERS: "corners"
} as const;
export type BoxKind = (typeof BoxKind)[keyof typeof BoxKind];

export const TrackKind = {
  PIXELS: "px",
  FRACTION: "fr",
  AUTO: "auto"
} as const;
export type TrackKind = (typeof TrackKind)[keyof typeof TrackKind];

const SIDE_PROPERTIES = new Set(["padding", "margin", "border-width"]);
const CORNER_PROPERTIES = new Set(["border-radius"]);
const GRID_PROPERTIES = new Set(["grid-template-columns", "grid-template-rows"]);
const FRACTION = /^(\d*\.?\d+)(fr|\*)$/iu;
const STAR = "*";
const BAR_WIDTH = 240;
const AUTO_WIDTH = 48;
const FIXED_LIMIT = 150;
const SHARE_DIGITS = 3;
const THREE = 3;
const FOUR = 4;

function sumOf(numbers: number[]) {
  let total = 0;
  for (const number of numbers) {
    total += number;
  }

  return total;
}

function expanded(values: number[]) {
  const [first = 0, second = first, third = first, fourth = second] = values;
  const isThree = values.length === THREE;
  return [first, second, third, isThree ? second : fourth];
}

/**
 * Whether the property is one the box model diagram draws.
 */
export function isBoxProperty(property: string) {
  return SIDE_PROPERTIES.has(property) || CORNER_PROPERTIES.has(property);
}

/**
 * The four values of a `padding`, `margin`, `border-width` or `border-radius` written in pixels (one to four, in
 * CSS order), as top, right, bottom, left (corners: top left, top right, bottom right, bottom left); undefined when
 * the value uses any other unit, since WinUI's units are native pixels only (src/css/parse/units.ts).
 */
export function boxOf({ property, value }: {
  property: string;
  value: string;
}) {
  const isBox = isBoxProperty(property);
  const words = splitTopLevel({
    text: value.replaceAll(",", " "),
    separator: " "
  });
  const pixels = words.map(pixelsOf);
  const isPixels = pixels.length >= 1 && pixels.length <= FOUR && pixels.every(pixel => pixel !== undefined);
  const isReadable = isBox && isPixels;
  if (!isReadable) {
    return undefined;
  }

  return {
    kind: CORNER_PROPERTIES.has(property) ? BoxKind.CORNERS : BoxKind.SIDES,
    property,
    values: expanded(pixels.filter(pixel => pixel !== undefined))
  };
}

function trackOf(word: string) {
  const lower = word.toLowerCase();
  const isAuto = lower === TrackKind.AUTO;
  if (isAuto) {
    return {
      kind: TrackKind.AUTO,
      amount: 0
    };
  }

  const fraction = FRACTION.exec(lower);
  const isFraction = lower === STAR || fraction !== null;
  if (isFraction) {
    return {
      kind: TrackKind.FRACTION,
      amount: Number(fraction?.[1] ?? 1)
    };
  }

  const pixels = pixelsOf(lower);
  return pixels === undefined ? undefined : {
    kind: TrackKind.PIXELS,
    amount: pixels
  };
}

/**
 * The tracks of a `grid-template-columns` or `-rows` value (or a `columns` or `rows` prop) made of `auto`, pixels
 * and `fr` (`*` counts as 1fr), each with its share of a bar: pixels as written (squeezed together when they
 * pass 150), auto a fixed width, the fractions the rest in proportion. Undefined when any track is anything else.
 */
export function tracksOf(value: string) {
  const tracks = splitTopLevel({
    text: value.replaceAll(",", " "),
    separator: " "
  }).map(trackOf);
  const isReadable = tracks.length > 0 && tracks.every(track => track !== undefined);
  if (!isReadable) {
    return undefined;
  }

  const read = tracks.filter(track => track !== undefined);
  const fixed = sumOf(read.filter(track => track.kind === TrackKind.PIXELS).map(track => track.amount));
  const fractions = sumOf(read.filter(track => track.kind === TrackKind.FRACTION).map(track => track.amount));
  const scale = fixed > FIXED_LIMIT ? FIXED_LIMIT / fixed : 1;
  const autos = read.filter(track => track.kind === TrackKind.AUTO).length;
  const rest = Math.max(BAR_WIDTH - fixed * scale - autos * AUTO_WIDTH, 0);
  const widths = read.map(track => {
    const isPixels = track.kind === TrackKind.PIXELS;
    if (isPixels) {
      return track.amount * scale;
    }

    return track.kind === TrackKind.AUTO ? AUTO_WIDTH : rest * track.amount / fractions;
  });
  const total = sumOf(widths);
  return read.map((track, i) => ({
    ...track,
    share: Number(((widths[i] ?? 0) / total).toFixed(SHARE_DIGITS))
  }));
}

/**
 * Whether the property is a grid track list.
 */
export function isTrackProperty(property: string) {
  return GRID_PROPERTIES.has(property);
}
