import { detectedTextOf } from "./detected-text.ts";
import { DOMRectReadOnly } from "./dom-rect-read-only.ts";
import type { OcrBox } from "./text-geometry.ts";
import { availableOcrLanguages, isOcrLanguageSupported, recognizePixels } from "./text-recognizer.ts";
import { DomErrorName, domException } from "#src/web-apis/dom-exception.js";
import { swapRedBlue } from "#src/web-apis/image-pixels.js";
import type { ImageBitmapSource } from "#src/web-apis/images.js";
import { createImageBitmap, ImageBitmap } from "#src/web-apis/images.js";
import { defineProperty } from "#src/web-apis/install.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import { z } from "zod";

// The Shape Detection API's TextDetector over the OCR that ships with Windows
// (Windows.Media.Ocr). It needs no window and no package identity, only a
// started WinRT apartment; a `Blob` source needs the image codecs
// (`installImageCodecs` from winui-svelte/web-apis/images), as `createImageBitmap` does.

const OPTIONS_SCHEMA = z.strictObject({
  region: z.strictObject({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite()
  }).optional(),
  languages: z.array(z.string().min(1)).optional()
});

/**
 * The extras of `new TextDetector(options)`; the web's constructor takes none.
 *
 * - `languages`: BCP 47 tags (`"en-US"`, `"he"`) of the recognizers to use, in
 *   order of preference; without them the user's profile languages come
 *   first, then one recognizer per installed language, and the first that
 *   finds a line wins
 * - `region`: the part of every source image to read, in the source's pixels
 */
export type TextDetectorOptions = z.input<typeof OPTIONS_SCHEMA>;

async function imageDataOf(image: ImageBitmapSource) {
  const isBitmap = image instanceof ImageBitmap;
  if (isBitmap) {
    return image.toImageData();
  }

  const isPixels = image instanceof ImageData;
  if (isPixels) {
    return image;
  }

  return (await createImageBitmap(image)).toImageData();
}

/**
 * The web `TextDetector`: finds text in an image with the OCR that ships with
 * Windows.
 *
 * ```ts
 * const detector = new TextDetector({ languages: ["en"] });
 * const texts = await detector.detect(imageBitmap);
 * for (const { rawValue, boundingBox, words } of texts) {
 *   console.log(rawValue, boundingBox.x, boundingBox.y, words.length);
 * }
 * ```
 */
export class TextDetector {
  private readonly region: OcrBox | undefined;
  private readonly languages: readonly string[] | undefined;

  /**
   * Makes a detector; the web's constructor takes no arguments, the options are the lib's extras.
   *
   * @param options - Extra: the recognizer languages and the region to read.
   * @throws {TypeError} when an option has the wrong type or shape.
   * @throws {DOMException} `NotSupportedError` when no recognizer language is installed,
   *   or none of the named `languages` is.
   */
  constructor(options: TextDetectorOptions = {}) {
    const parsed = OPTIONS_SCHEMA.safeParse(options);
    if (!parsed.success) {
      throw new TypeError(`TextDetector: ${parsed.error.message}`);
    }

    this.region = parsed.data.region;
    this.languages = parsed.data.languages;
    const isAnyInstalled = availableOcrLanguages().length > 0;
    const isNamed = this.languages !== undefined && this.languages.length > 0;
    const isNamedInstalled = this.languages?.some(isOcrLanguageSupported) ?? true;
    const isSupported = isAnyInstalled && (!isNamed || isNamedInstalled);
    if (!isSupported) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: "No OCR recognizer is installed for the requested languages (Settings, Time and language)"
      });
    }
  }

  /**
   * Extra: the tags of the recognizer languages installed on this machine
   * (`["en-GB", "en-US"]`), empty when there is none. Language packs belong to
   * the machine and the user's profile.
   */
  static availableOcrLanguages() {
    return availableOcrLanguages();
  }

  /**
   * Finds the text in an image: one entry per line, in the order Windows
   * returns them. Resolves with an empty array when there is no text or the
   * region misses the image.
   *
   * @param image - An `ImageBitmap`, `ImageData`, a canvas, or a `Blob` of an encoded image.
   * @returns The lines, with their words.
   * @throws {TypeError} when `image` is not an image source.
   * @throws {DOMException} `InvalidStateError` for a closed bitmap or an image Windows cannot decode.
   */
  async detect(image: ImageBitmapSource) {
    const pixels = await imageDataOf(image);
    try {
      const { lines } = await recognizePixels({
        pixels: swapRedBlue(pixels.data),
        width: pixels.width,
        height: pixels.height,
        region: this.region,
        languages: this.languages
      });
      return lines.map(detectedTextOf);
    } catch {
      return [];
    }
  }

  get [Symbol.toStringTag]() {
    return "TextDetector";
  }
}

/**
 * Defines `globalThis.TextDetector`, and `DOMRectReadOnly` where the realm has
 * none (the window thread is a worker without it).
 *
 * @returns The function that takes them away again.
 */
export function installTextDetector() {
  const uninstalls = [defineProperty({
    name: "TextDetector",
    value: TextDetector
  })];
  const hasRectangle = "DOMRectReadOnly" in globalThis;
  if (!hasRectangle) {
    uninstalls.push(
      defineProperty({
        name: "DOMRectReadOnly",
        value: DOMRectReadOnly
      })
    );
  }

  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }
  };
}
