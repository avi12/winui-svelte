import { parseColor } from "../../../src/css/parse/colors.ts";

const ALPHA_DIGITS = 2;
const OPAQUE_DIGITS = 6;

/**
 * The CSS (`#rrggbb` or `#rrggbbaa`) of a color written in CSS, or undefined when it is not one WinUI can say.
 */
export function cssColorOf(text: string) {
  const xaml = parseColor(text.trim());
  const isNotColor = xaml === null;
  if (isNotColor) {
    return undefined;
  }

  const digits = xaml.slice(1).toLowerCase();
  const isOpaque = digits.length === OPAQUE_DIGITS;
  return isOpaque ? `#${digits}` : `#${digits.slice(ALPHA_DIGITS)}${digits.slice(0, ALPHA_DIGITS)}`;
}

const HEX_RADIX = 16;
const BYTE = 255;
const OPAQUE_DIGIT_COUNT = 6;

/**
 * The channels of a color written in CSS (alpha from 0 to 1), or undefined when it is not one WinUI can say.
 */
export function colorChannelsOf(text: string) {
  const css = cssColorOf(text);
  const isNotColor = css === undefined;
  if (isNotColor) {
    return undefined;
  }

  const digits = css.slice(1);
  const [red = 0, green = 0, blue = 0, alpha = BYTE] = digits.match(/../gu)?.map(pair => Number.parseInt(pair, HEX_RADIX)) ?? [];
  return {
    red,
    green,
    blue,
    alpha: digits.length === OPAQUE_DIGIT_COUNT ? 1 : alpha / BYTE
  };
}

/**
 * The `#rrggbbaa` of channels, the one spelling the previews and their fixtures use.
 */
export function hexOfChannels({ red, green, blue, alpha }: {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}) {
  return `#${[red, green, blue, Math.round(alpha * BYTE)].map(channel => channel.toString(HEX_RADIX).padStart(2, "0")).join("")}`;
}
