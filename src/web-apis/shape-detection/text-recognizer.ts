import {
  BitmapAlphaMode,
  BitmapPixelFormat,
  Language,
  OcrEngine,
  SoftwareBitmap
} from "./text-bindings.ts";
import type { OcrBox } from "./text-geometry.ts";
import { cropOf, croppedPixels, downscaledPixels, fittedSize } from "./text-geometry.ts";
import type { OcrCandidate, OcrResult, RecognizingEngine } from "./text-recognition.ts";
import { candidatesOf, firstRecognition, linesInSource, OcrCandidateKind } from "./text-recognition.ts";
import { bufferOf } from "#src/devices/buffers.js";

// The Windows side of the TextDetector: the pixels of the region into a
// SoftwareBitmap, the engines of Windows.Media.Ocr, and the way back to source
// pixels. It needs no window and no package identity, only a started WinRT
// apartment.

/**
 * The tags of the recognizer languages installed on this machine, the
 * languages a `TextDetector` can read (`["en-GB", "en-US"]`). Language packs
 * belong to the machine and the user's profile: to read another language the
 * user adds its pack in Settings, Time and language, Language and region.
 * Empty when there is none.
 */
export function availableOcrLanguages() {
  return [...(OcrEngine.availableRecognizerLanguages ?? [])].map(language => language.languageTag);
}

/** Whether a recognizer for the language (a BCP 47 tag) is installed. */
export function isOcrLanguageSupported(tag: string) {
  return Language.isWellFormed(tag) && OcrEngine.isLanguageSupported(Language.createLanguage(tag));
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

/**
 * Reads the text of a region of BGRA pixels: crops, scales down to the
 * engine's largest edge, asks the engines in order until one finds a line and
 * moves the boxes back into the pixels given.
 *
 * @returns The lines, empty when there is no text or the region misses the image.
 */
export async function recognizePixels({ pixels, width, height, region, languages }: {
  readonly pixels: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly region: OcrBox | undefined;
  readonly languages: readonly string[] | undefined;
}) {
  const crop = cropOf({
    region,
    width,
    height
  });
  const isOutside = crop === undefined;
  if (isOutside) {
    return {
      lines: [],
      language: ""
    } satisfies OcrResult;
  }

  const cropped = croppedPixels({
    pixels,
    width,
    crop
  });
  const read = fittedSize({
    width: crop.width,
    height: crop.height,
    limit: OcrEngine.maxImageDimension
  });
  const isScaled = read.width !== crop.width || read.height !== crop.height;
  const readable = isScaled
    ? downscaledPixels({
      pixels: cropped,
      source: crop,
      target: read
    })
    : cropped;
  const bitmap = SoftwareBitmap.createCopyFromBuffer(
    bufferOf(readable),
    BitmapPixelFormat.Bgra8,
    read.width,
    read.height,
    BitmapAlphaMode.Ignore
  );
  const candidates = candidatesOf({
    requested: languages,
    installed: availableOcrLanguages(),
    isSupported: isOcrLanguageSupported
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
      crop,
      read
    })
  } satisfies OcrResult;
}
