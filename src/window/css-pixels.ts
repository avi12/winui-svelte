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
