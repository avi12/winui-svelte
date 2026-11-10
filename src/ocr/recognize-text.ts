import {
  BitmapAlphaMode,
  BitmapDecoder,
  BitmapPixelFormat,
  BitmapTransform,
  ColorManagementMode,
  ExifOrientationMode,
  Language,
  OcrEngine,
  SoftwareBitmap
} from "./bindings.ts";
import type { OcrBox } from "./geometry.ts";
import { cropOf, croppedPixels, downscaledPixels, fittedSize } from "./geometry.ts";
import type { OcrCandidate, OcrResult, RecognizingEngine } from "./recognition.ts";
import { candidatesOf, firstRecognition, linesInSource, OcrCandidateKind } from "./recognition.ts";
import type { RecognizeTextOptions } from "./recognize-options.ts";
import { RECOGNIZE_OPTIONS_SCHEMA } from "./recognize-options.ts";
import { streamOf } from "#src/components/byte-stream.js";
import { bufferOf } from "#src/devices/buffers.js";

// The Windows side: the pixels of the region into a SoftwareBitmap, the
// engines of Windows.Media.Ocr, and the way back to source pixels. It needs no
// window and no package identity, only a started WinRT apartment.

function emptyResult() {
  return {
    lines: [],
    language: ""
  } satisfies OcrResult;
}

/**
 * The tags of the recognizer languages installed on this machine, the
 * languages `recognizeText` can read (`["en-GB", "en-US"]`). Language packs
 * belong to the machine and the user's profile: to read another language the
 * user adds its pack in Settings, Time and language, Language and region.
 * Empty when there is none.
 */
export function availableOcrLanguages() {
  return [...(OcrEngine.availableRecognizerLanguages ?? [])].map(language => language.languageTag);
}

function isSupported(tag: string) {
  return Language.isWellFormed(tag) && OcrEngine.isLanguageSupported(Language.createLanguage(tag));
}

async function decodedRegion({ bytes, region }: {
  readonly bytes: Uint8Array;
  readonly region: OcrBox | undefined;
}) {
  const decoder = await BitmapDecoder.createAsync(await streamOf(bytes));
  const width = decoder.pixelWidth;
  const height = decoder.pixelHeight;
  const crop = cropOf({
    region,
    width,
    height
  });
  const isOutside = crop === undefined;
  if (isOutside) {
    return undefined;
  }

  const transform = new BitmapTransform();
  transform.bounds = crop;
  const data = await decoder.getPixelDataAsync(
    BitmapPixelFormat.Bgra8,
    BitmapAlphaMode.Straight,
    transform,
    ExifOrientationMode.IgnoreExifOrientation,
    ColorManagementMode.DoNotColorManage
  );
  return {
    crop,
    pixels: new Uint8Array(data.detachPixelData())
  };
}

function rawRegion({ options, region }: {
  readonly options: Extract<RecognizeTextOptions, { pixels: unknown }>;
  readonly region: OcrBox | undefined;
}) {
  const { pixels, width, height } = options;
  const crop = cropOf({
    region,
    width,
    height
  });
  const isOutside = crop === undefined;
  if (isOutside) {
    return undefined;
  }

  const bytes = new Uint8Array(pixels.buffer, pixels.byteOffset, pixels.byteLength);
  return {
    crop,
    pixels: croppedPixels({
      pixels: bytes,
      width,
      crop
    })
  };
}

function engineOf({ candidate, bitmap }: {
  readonly candidate: OcrCandidate;
  readonly bitmap: SoftwareBitmap;
}) {
  const engine = candidate.kind === OcrCandidateKind.PROFILE
    ? OcrEngine.tryCreateFromUserProfileLanguages()
    : OcrEngine.tryCreateFromLanguage(Language.createLanguage(candidate.tag));
  // The metadata says non-null; Windows returns null for a language it cannot read.
  const isEngine = engine instanceof OcrEngine;
  if (!isEngine) {
    return undefined;
  }

  return {
    language: engine.recognizerLanguage.languageTag,
    async recognize() {
      const result = await engine.recognizeAsync(bitmap);
      return [...(result.lines ?? [])].map(line => ({
        text: line.text,
        words: [...(line.words ?? [])].map(word => ({
          text: word.text,
          bounds: word.boundingRect
        }))
      }));
    }
  } satisfies RecognizingEngine;
}

async function recognize(options: RecognizeTextOptions) {
  const parsed = RECOGNIZE_OPTIONS_SCHEMA.parse(options);
  const region = "pixels" in parsed
    ? rawRegion({
      options: parsed,
      region: parsed.region
    })
    : await decodedRegion({
      bytes: parsed.jpeg,
      region: parsed.region
    });
  const isOutside = region === undefined;
  if (isOutside) {
    return emptyResult();
  }

  const read = fittedSize({
    width: region.crop.width,
    height: region.crop.height,
    limit: OcrEngine.maxImageDimension
  });
  const isScaled = read.width !== region.crop.width || read.height !== region.crop.height;
  const pixels = isScaled
    ? downscaledPixels({
      pixels: region.pixels,
      source: region.crop,
      target: read
    })
    : region.pixels;
  const bitmap = SoftwareBitmap.createCopyFromBuffer(
    bufferOf(pixels),
    BitmapPixelFormat.Bgra8,
    read.width,
    read.height,
    BitmapAlphaMode.Ignore
  );
  const candidates = candidatesOf({
    requested: parsed.languages,
    installed: availableOcrLanguages(),
    isSupported
  });
  const found = await firstRecognition(
    candidates.map(candidate => () => engineOf({
      candidate,
      bitmap
    }))
  );
  return {
    language: found.language,
    lines: linesInSource({
      lines: found.lines,
      crop: region.crop,
      read
    })
  } satisfies OcrResult;
}

/**
 * Reads the text in an image, or in a region of it, with the OCR that ships
 * with Windows, and returns it as lines of words with their boxes in the
 * source image's pixels (offset by the region, undone the downscale to the
 * engine's largest edge), so a caller can lay a selection over the words.
 *
 * Engines are tried until one finds a line: with `languages`, the supported
 * ones in the order given; without, the user's profile languages first, then
 * one per installed recognizer language. Words keep the order Windows returns
 * them, which for a right-to-left script is right to left; each has its own
 * box.
 *
 * It never throws. Nothing found, no recognizer language installed, a
 * language that is not installed, a region outside the image, an image
 * Windows cannot decode and invalid options all give `{ lines: [], language: "" }`;
 * `availableOcrLanguages()` tells the cases apart where it matters.
 *
 * @param options - The image and what to read in it.
 * @returns The lines found and the recognizer language that found them.
 */
export async function recognizeText(options: RecognizeTextOptions) {
  try {
    return await recognize(options);
  } catch {
    return emptyResult();
  }
}
