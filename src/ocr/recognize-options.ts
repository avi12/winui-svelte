import { BYTES_PER_PIXEL } from "./geometry.ts";
import { z } from "zod";

const REGION_SCHEMA = z.strictObject({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite()
});

const SHARED_SHAPE = {
  region: REGION_SCHEMA.optional(),
  languages: z.array(z.string().min(1)).optional()
};

const PIXELS_SCHEMA = z.strictObject({
  ...SHARED_SHAPE,
  pixels: z.union([z.instanceof(Uint8Array), z.instanceof(Uint8ClampedArray)]),
  width: z.number().int().positive(),
  height: z.number().int().positive()
}).refine(options => options.pixels.length >= options.width * options.height * BYTES_PER_PIXEL, {
  message: "pixels hold fewer than width x height x 4 bytes"
});

const ENCODED_SCHEMA = z.strictObject({
  ...SHARED_SHAPE,
  jpeg: z.instanceof(Uint8Array),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
});

/** What `recognizeText` checks its options against: the pixels or the encoded image, never both. */
export const RECOGNIZE_OPTIONS_SCHEMA = z.union([PIXELS_SCHEMA, ENCODED_SCHEMA]);

/**
 * The image to read, one of two forms, and what to read in it.
 *
 * - `{ pixels, width, height }`: raw pixels, four bytes each, blue, green, red
 *   then alpha (Windows' own order; alpha is ignored), row by row, as a screen
 *   grab gives them. `pixels` may be a `Uint8Array` or a `Uint8ClampedArray`
 * - `{ jpeg }`: an encoded image, JPEG or anything else Windows has a decoder
 *   for (PNG, BMP, GIF, TIFF). `width` and `height` are optional and unused
 *   there: the decoder knows them
 *
 * `region` is the part to read, in the source image's pixels; without it the
 * whole image is read. `languages` are BCP 47 tags (`"en-US"`, `"he"`) of the
 * recognizers to use, in order of preference.
 */
export type RecognizeTextOptions = z.input<typeof RECOGNIZE_OPTIONS_SCHEMA>;
