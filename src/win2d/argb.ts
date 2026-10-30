import type { Color } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";

const ARGB_DIGITS = 8;
const HEX_RADIX = 16;
const CHANNEL_DIGITS = 2;
const BLUE_BYTE = 3;

function byteOf({ hex, iByte }: {
  hex: string;
  iByte: number;
}) {
  const start = iByte * CHANNEL_DIGITS;
  return Number.parseInt(hex.slice(start, start + CHANNEL_DIGITS), HEX_RADIX);
}

/** A XAML colour (`#AARRGGBB` or `#RRGGBB`) as the colour struct Win2D and Composition take. */
export function colorOfArgb(argb: string) {
  const digits = argb.slice(1);
  const hex = digits.length === ARGB_DIGITS ? digits : `ff${digits}`;
  return {
    a: byteOf({
      hex,
      iByte: 0
    }),
    r: byteOf({
      hex,
      iByte: 1
    }),
    g: byteOf({
      hex,
      iByte: 2
    }),
    b: byteOf({
      hex,
      iByte: BLUE_BYTE
    })
  } satisfies Color;
}
