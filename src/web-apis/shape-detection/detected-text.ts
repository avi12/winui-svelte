import { DOMRectReadOnly } from "./dom-rect-read-only.ts";
import { cornerPointsOf } from "./text-geometry.ts";
import type { OcrLine, OcrWord } from "./text-recognition.ts";

/** A point, as the web's `Point2D`. */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/** One word of a detected line: the lib's extra, with the same members as the line. */
export interface DetectedWord {
  readonly rawValue: string;
  readonly boundingBox: DOMRectReadOnly;
  readonly cornerPoints: readonly Point2D[];
}

/**
 * One recognized text block, as the web's `DetectedText`: a line.
 * `words` is the lib's extra, in the order Windows returns them (right to left
 * for a right-to-left script), each with its own box. Boxes and points are in
 * the source image's pixels; the corner points run clockwise from the top left.
 */
export interface DetectedText extends DetectedWord {
  readonly words: readonly DetectedWord[];
}

function detectedWordOf(word: OcrWord) {
  return {
    rawValue: word.text,
    boundingBox: DOMRectReadOnly.fromRect(word.bounds),
    cornerPoints: cornerPointsOf(word.bounds)
  } satisfies DetectedWord;
}

/** A recognized line as the web's `DetectedText`, with its words. */
export function detectedTextOf(line: OcrLine) {
  return {
    ...detectedWordOf({
      text: line.text,
      bounds: line.bounds
    }),
    words: line.words.map(detectedWordOf)
  } satisfies DetectedText;
}
