import { z } from "zod";

// What an app hands the capture entry is checked once, here: a monitor, a
// region, a rate, a size. A rectangle is whole physical pixels.

const MIN_FRAMES_PER_SECOND = 1;
const MAX_FRAMES_PER_SECOND = 240;
const MAX_EDGE_PIXELS = 16_384;
const DECIMAL = /^\d+$/u;

const rectangleSchema = z.object({
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
const sizeSchema = z.object({
  width: z.number().int().positive().max(MAX_EDGE_PIXELS),
  height: z.number().int().positive().max(MAX_EDGE_PIXELS)
});
const framesPerSecondSchema = z.number().min(MIN_FRAMES_PER_SECOND).max(MAX_FRAMES_PER_SECOND);
const maxEdgeSchema = z.number().int().positive().max(MAX_EDGE_PIXELS);
const qualitySchema = z.number().min(0).max(1);

/**
 * Checks a region.
 *
 * @param value - Anything.
 * @returns The region, in whole pixels.
 * @throws {z.ZodError} when it is not a rectangle of positive whole pixels
 */
export function parseRegion(value: unknown) {
  return rectangleSchema.parse(value);
}

/**
 * Checks a monitor: a rectangle of the monitor in physical pixels, or a display id.
 *
 * @param value - Anything.
 * @returns A rectangle, or the display id as a `bigint`.
 * @throws {z.ZodError} when it is neither
 */
export function parseMonitor(value: unknown) {
  return monitorSchema.parse(value);
}

/**
 * Checks a picture size.
 *
 * @param value - Anything.
 * @returns The size.
 * @throws {z.ZodError} when a side is not a positive whole number
 */
export function parseSize(value: unknown) {
  return sizeSchema.parse(value);
}

/**
 * Checks a rate in frames a second.
 *
 * @param value - Anything.
 * @returns The rate, from 1 to 240.
 * @throws {z.ZodError} when it is out of range
 */
export function parseFramesPerSecond(value: unknown) {
  return framesPerSecondSchema.parse(value);
}

/**
 * Checks a longest-edge limit.
 *
 * @param value - Anything.
 * @returns The limit in pixels.
 * @throws {z.ZodError} when it is not a positive whole number
 */
export function parseMaxEdge(value: unknown) {
  return maxEdgeSchema.parse(value);
}

/**
 * Checks a JPEG quality.
 *
 * @param value - Anything.
 * @returns A number from 0 to 1.
 * @throws {z.ZodError} when it is out of range
 */
export function parseQuality(value: unknown) {
  return qualitySchema.parse(value);
}
