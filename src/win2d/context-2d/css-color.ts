import { resolveModernColor } from "#src/css/parse/modern-colors.js";
import type { Color } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

const HEX_RADIX = 16;
const HEX_PAIR = 2;
const RGB_DIGITS = 6;
const MAX_CHANNEL = 255;
const ALPHA_DECIMALS = 3;

/**
 * The color a CSS color string spells (hex, rgb(), hsl(), a name, `transparent`,
 * and the CSS Color 4 functions the CSS part reads), or undefined when it
 * spells none. Channels are 0 to 255.
 */
export function colorFromCss(text: string) {
  const spelled = resolveModernColor({ token: text.trim() });
  const isUnreadable = spelled === null;
  if (isUnreadable) {
    return undefined;
  }

  const digits = spelled.slice(1);
  const hasAlpha = digits.length > RGB_DIGITS;
  const offset = hasAlpha ? HEX_PAIR : 0;
  function channel(index: number) {
    const start = offset + index * HEX_PAIR;
    return Number.parseInt(digits.slice(start, start + HEX_PAIR), HEX_RADIX);
  }

  return {
    a: hasAlpha ? Number.parseInt(digits.slice(0, HEX_PAIR), HEX_RADIX) : MAX_CHANNEL,
    r: channel(0),
    g: channel(1),
    b: channel(2)
  } satisfies Color;
}

/** A color as `fillStyle` reads back: `#rrggbb` when opaque, `rgba()` otherwise. */
export function cssFromColor(color: Color) {
  const isOpaque = color.a === MAX_CHANNEL;
  if (isOpaque) {
    const digits = [color.r, color.g, color.b].map(channel => channel.toString(HEX_RADIX).padStart(HEX_PAIR, "0"));
    return `#${digits.join("")}`;
  }

  const alpha = Number((color.a / MAX_CHANNEL).toFixed(ALPHA_DECIMALS));
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`;
}

/** The same color with its alpha multiplied by an opacity from 0 to 1. */
export function withOpacity({ color, opacity }: {
  color: Color;
  opacity: number;
}) {
  return {
    ...color,
    a: Math.round(color.a * opacity)
  } satisfies Color;
}
