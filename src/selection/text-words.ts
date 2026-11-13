import type { Point } from "./geometry.ts";
import { rectangleContains } from "./geometry.ts";
import type { Rectangle } from "#src/capture/region.js";

/** The reach `wordAt` has by default: a press has to land on the word. */
export const DEFAULT_WORD_REACH = 0;

/**
 * One recognized word, in the pixels of whatever the caller draws it in.
 * `TextDetector` words map to it with `rawValue` as `text` and `boundingBox`
 * as `bounds`.
 */
export interface SelectableWord {
  readonly text: string;
  readonly bounds: Rectangle;

  /** The line the word is on, so a joined text breaks where the line does. */
  readonly line?: number;
}

/**
 * A line of recognized text as `TextDetector` returns it, reduced to what
 * `selectableWords` reads.
 */
export interface RecognizedLine {
  readonly words: readonly {
    readonly rawValue: string;
    readonly boundingBox: Rectangle;
  }[];
}

/** An inclusive run of word indices, `start` never past `end`. */
export interface WordRange {
  readonly start: number;
  readonly end: number;
}

/**
 * The words of recognized lines in reading order: line by line, each line's
 * words in the order the recognizer returned them (logical order, so a
 * right-to-left line runs from its right edge).
 *
 * @param lines - The lines, from `TextDetector.detect`.
 * @returns The words, each tagged with its line.
 */
export function selectableWords(lines: readonly RecognizedLine[]) {
  return lines.flatMap((line, iLine) =>
    line.words.map(word => ({
      text: word.rawValue,
      bounds: word.boundingBox,
      line: iLine
    } satisfies SelectableWord)));
}

function distanceToRectangle({ rectangle, point }: {
  rectangle: Rectangle;
  point: Point;
}) {
  const gapX = Math.max(rectangle.x - point.x, 0, point.x - rectangle.x - rectangle.width);
  const gapY = Math.max(rectangle.y - point.y, 0, point.y - rectangle.y - rectangle.height);
  return Math.hypot(gapX, gapY);
}

/**
 * The word nearest a point, as long as the point is within `reach` of it.
 *
 * @param options - The words, the point and how far from a word's box it may be.
 * @returns The index of the word, or undefined when none is within `reach`.
 */
export function wordAt({ words, point, reach = DEFAULT_WORD_REACH }: {
  words: readonly SelectableWord[];
  point: Point;
  reach?: number;
}) {
  let nearest: number | undefined = undefined;
  let nearestDistance = Infinity;
  for (const [iWord, word] of words.entries()) {
    const distance = distanceToRectangle({
      rectangle: word.bounds,
      point
    });
    const isNearer = distance < nearestDistance;
    if (isNearer) {
      nearest = iWord;
      nearestDistance = distance;
    }
  }

  const isInReach = nearestDistance <= reach;
  if (!isInReach) {
    return undefined;
  }

  return nearest;
}

/**
 * The words from one index to another in reading order, across lines.
 *
 * @param options - The words and the two ends, in either order.
 * @returns The range, kept inside the words, or undefined when there are none.
 */
export function wordsBetween({ words, from, to }: {
  words: readonly SelectableWord[];
  from: number;
  to: number;
}) {
  const isEmpty = words.length === 0;
  if (isEmpty) {
    return undefined;
  }

  const last = words.length - 1;
  const first = Math.min(Math.max(from, 0), last);
  const second = Math.min(Math.max(to, 0), last);
  return {
    start: Math.min(first, second),
    end: Math.max(first, second)
  } satisfies WordRange;
}

/**
 * The words whose centre lies in a region, in reading order.
 *
 * @param options - The words and the region.
 * @returns The indices of the words inside.
 */
export function wordsInRegion({ words, region }: {
  words: readonly SelectableWord[];
  region: Rectangle;
}) {
  const inside: number[] = [];
  for (const [iWord, word] of words.entries()) {
    const isInside = rectangleContains({
      rectangle: region,
      point: {
        x: word.bounds.x + word.bounds.width / 2,
        y: word.bounds.y + word.bounds.height / 2
      }
    });
    if (isInside) {
      inside.push(iWord);
    }
  }

  return inside;
}

/**
 * The text of a run of words: spaces within a line, a line break where the
 * line changes.
 *
 * @param options - The words and the range.
 * @returns The joined text.
 */
export function joinWords({ words, range }: {
  words: readonly SelectableWord[];
  range: WordRange;
}) {
  let text = "";
  let previous: SelectableWord | undefined = undefined;
  for (const word of words.slice(range.start, range.end + 1)) {
    const isNewLine = previous !== undefined && previous.line !== word.line;
    if (isNewLine) {
      text += "\n";
    } else if (previous !== undefined) {
      text += " ";
    }

    text += word.text;
    previous = word;
  }

  return text;
}
