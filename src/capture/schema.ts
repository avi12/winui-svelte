import { z } from "zod";

// What an app hands the capture is checked once, here: a region, a monitor, a
// rate. A rectangle is whole physical pixels.

const MIN_FRAMES_PER_SECOND = 1;
const MAX_FRAMES_PER_SECOND = 240;
const MAX_EDGE_PIXELS = 16_384;
const DECIMAL = /^\d+$/u;

const regionSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive().max(MAX_EDGE_PIXELS),
  height: z.number().int().positive().max(MAX_EDGE_PIXELS)
});

const monitorRectangleSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

const displayMonitorSchema = z.object({
  displayId: z.union([z.bigint(), z.string().regex(DECIMAL, "a display id is a decimal number")]).transform(id => BigInt(id))
});

const monitorSchema = z.union([displayMonitorSchema, monitorRectangleSchema]);

/**
 * Checks a region.
 *
 * @param value - Anything.
 * @returns The region, in whole pixels.
 * @throws {TypeError} when it is not a rectangle of positive whole pixels
 */
export function parseRegion(value: unknown) {
  const parsed = regionSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(`a region is x, y, width and height in whole pixels, width and height above 0: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * Checks a monitor: a rectangle of the monitor in physical pixels, or a display id.
 *
 * @param value - Anything.
 * @returns A rectangle, or the display id as a `bigint`.
 * @throws {TypeError} when it is neither
 */
export function parseMonitor(value: unknown) {
  const parsed = monitorSchema.safeParse(value);
  if (!parsed.success) {
    throw new TypeError(`a monitor is its rectangle in physical pixels or { displayId }: ${parsed.error.message}`);
  }

  return parsed.data;
}

/**
 * A rate in frames a second brought into the range Windows can deliver.
 *
 * @param framesPerSecond - Any positive number.
 * @returns The rate, from 1 to 240.
 */
export function clampedFramesPerSecond(framesPerSecond: number) {
  return Math.min(MAX_FRAMES_PER_SECOND, Math.max(MIN_FRAMES_PER_SECOND, framesPerSecond));
}
