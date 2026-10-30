import type { Color } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

const ARGB_DIGITS = 8;
const HEX_RADIX = 16;
const CHANNEL_DIGITS = 2;
const BLUE_BYTE = 3;

/** A XAML colour (`#AARRGGBB` or `#RRGGBB`) as the colour struct Win2D and Composition take. */
export function colorOfArgb(argb: string) {
  const digits = argb.slice(1);
  const hex = digits.length === ARGB_DIGITS ? digits : `ff${digits}`;
  const byte = (iByte: number) => {
    const start = iByte * CHANNEL_DIGITS;
    return Number.parseInt(hex.slice(start, start + CHANNEL_DIGITS), HEX_RADIX);
  };
  return {
    a: byte(0),
    r: byte(1),
    g: byte(2),
    b: byte(BLUE_BYTE)
  } satisfies Color;
}
