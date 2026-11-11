/**
 * Device-independent pixels (what the web calls CSS pixels) as device pixels,
 * at `scale` device pixels per device-independent pixel.
 */
export function toDevicePixels({ value, scale }: {
  value: number;
  scale: number;
}) {
  return Math.round(value * scale);
}

/** Device pixels as device-independent (CSS) pixels, at `scale` device pixels per one. */
export function toCssPixels({ value, scale }: {
  value: number;
  scale: number;
}) {
  return Math.round(value / scale);
}

/**
 * What a window's `width` and `height` count: device-independent pixels, which
 * the scale of the window's display turns into device pixels, or physical
 * (device) pixels, which no display changes.
 */
export const SizeUnit = {
  dip: "dip",
  physical: "physical"
} as const;

/** One of `SizeUnit`'s values. */
export type SizeUnit = (typeof SizeUnit)[keyof typeof SizeUnit];

/** A window side of `value` `unit`s as device pixels, at `scale` device pixels per device-independent pixel. */
export function toWindowPixels({ value, unit, scale }: {
  value: number;
  unit: SizeUnit;
  scale: number;
}) {
  const isPhysical = unit === SizeUnit.physical;
  if (isPhysical) {
    return Math.round(value);
  }

  return toDevicePixels({
    value,
    scale
  });
}
