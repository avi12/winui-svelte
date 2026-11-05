import { parseColor } from "#src/css/parse/colors.js";
import type { NativeValue } from "#src/native-value.js";
import { isRecord, read } from "#src/renderer/host/reflect.js";

const HEX_RADIX = 16;
const MAX_CHANNEL = 255;
const RGB_DIGITS = 6;
const CHANNEL_DIGITS = 2;
const BLUE_OFFSET = 4;
const SRGB_LINEAR_LIMIT = 0.04045;
const SRGB_LINEAR_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const LUMINANCE_FLARE = 0.05;

/** A colour as WinUI holds it: each channel from 0 to 255. */
export interface Rgba {
  readonly alpha: number;
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

/** WCAG 2 AA: the least contrast of ordinary text and of large text (18.66 pixels bold, or 24 pixels). */
export const AA_CONTRAST = {
  TEXT: 4.5,
  LARGE_TEXT: 3
} as const;

function channelAt({ digits, offset }: {
  digits: string;
  offset: number;
}) {
  return Number.parseInt(digits.slice(offset, offset + 2), HEX_RADIX);
}

/**
 * Reads a CSS colour (hex, `rgb()`, `hsl()`, a name) with the CSS parser the
 * translation uses.
 *
 * @param css - The colour as CSS spells it.
 * @returns The colour, or null when it is not one.
 */
export function parseRgba(css: string) {
  const xaml = parseColor(css);
  const isUnparsed = xaml === null;
  if (isUnparsed) {
    return null;
  }

  const digits = xaml.slice(1);
  const hasAlpha = digits.length > RGB_DIGITS;
  const offset = hasAlpha ? 2 : 0;
  return {
    alpha: hasAlpha ? channelAt({
      digits,
      offset: 0
    }) : MAX_CHANNEL,
    red: channelAt({
      digits,
      offset
    }),
    green: channelAt({
      digits,
      offset: offset + CHANNEL_DIGITS
    }),
    blue: channelAt({
      digits,
      offset: offset + BLUE_OFFSET
    })
  };
}

function channelValue(value: NativeValue) {
  return typeof value === "number" ? value : null;
}

/**
 * The colour of a solid brush, or null for a brush of any other kind (a
 * gradient, an acrylic, a theme brush the tree cannot resolve) and for none.
 *
 * @param brush - A WinUI brush.
 * @returns The colour.
 */
export function rgbaOfBrush(brush: NativeValue) {
  const color = read(brush, "color");
  if (!isRecord(color)) {
    return null;
  }

  const alpha = channelValue(color["a"]);
  const red = channelValue(color["r"]);
  const green = channelValue(color["g"]);
  const blue = channelValue(color["b"]);
  const isComplete = alpha !== null && red !== null && green !== null && blue !== null;
  return isComplete ? {
    alpha,
    red,
    green,
    blue
  } : null;
}

function linear(channel: number) {
  const unit = channel / MAX_CHANNEL;
  return unit <= SRGB_LINEAR_LIMIT ? unit / SRGB_LINEAR_DIVISOR : ((unit + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
}

function luminance({ red, green, blue }: Rgba) {
  return RED_WEIGHT * linear(red) + GREEN_WEIGHT * linear(green) + BLUE_WEIGHT * linear(blue);
}

/**
 * The WCAG 2 contrast ratio of two opaque colours, from 1 to 21.
 *
 * @param colors - The text and the colour it is on.
 * @returns The ratio.
 */
export function contrastRatio({ foreground, background }: {
  foreground: Rgba;
  background: Rgba;
}) {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + LUMINANCE_FLARE) / (Math.min(first, second) + LUMINANCE_FLARE);
}
