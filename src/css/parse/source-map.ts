import type { SourcePosition } from "#src/css/translate/types.js";

/** The part of a version 3 source map that maps generated positions back. */
export interface SourceMapV3 {
  mappings: string;
}

/** Turns a position in the CSS Svelte emitted into the position in the `.svelte` file. */
export type PositionMapper = (generated: SourcePosition) => SourcePosition;

interface Segment {
  generatedColumn: number;
  sourceLine: number;
  sourceColumn: number;
}

const BASE64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const CONTINUATION_BIT = 32;
const VALUE_MASK = 31;
const BITS_PER_DIGIT = 5;

// The numbers of one segment (1, 4 or 5 of them), each a variable-length
// quantity whose lowest bit is its sign.
function decodeSegment(text: string) {
  const numbers: number[] = [];
  let value = 0;
  let shift = 0;
  for (const character of text) {
    const digit = BASE64_DIGITS.indexOf(character);
    value += (digit & VALUE_MASK) * 2 ** shift;
    const isLastDigit = (digit & CONTINUATION_BIT) === 0;
    if (isLastDigit) {
      const isNegative = value % 2 === 1;
      const magnitude = Math.floor(value / 2);
      numbers.push(isNegative ? -magnitude : magnitude);
      value = 0;
      shift = 0;
    } else {
      shift += BITS_PER_DIGIT;
    }
  }

  return numbers;
}

function decodeLines(mappings: string) {
  let sourceLine = 0;
  let sourceColumn = 0;
  return mappings.split(";").map(line => {
    let generatedColumn = 0;
    const segments: Segment[] = [];
    for (const text of line.split(",")) {
      const isSegmentEmpty = text === "";
      if (isSegmentEmpty) {
        continue;
      }

      const [columnDelta = 0, , lineDelta, columnDeltaInSource] = decodeSegment(text);
      generatedColumn += columnDelta;
      const hasSource = lineDelta !== undefined && columnDeltaInSource !== undefined;
      if (hasSource) {
        sourceLine += lineDelta;
        sourceColumn += columnDeltaInSource;
        segments.push({
          generatedColumn,
          sourceLine,
          sourceColumn
        });
      }
    }

    return segments;
  });
}

function passThrough(generated: SourcePosition) {
  return generated;
}

/**
 * Reads Svelte's `css.map` just far enough to map a position in the CSS it
 * emitted to the position in the `.svelte` file, so an error names the line
 * the author wrote. Without a map, positions pass through unchanged.
 */
export function createPositionMapper(map: SourceMapV3 | undefined) {
  const isMapMissing = map === undefined;
  if (isMapMissing) {
    return passThrough;
  }

  const lines = decodeLines(map.mappings);
  function mapPosition(generated: SourcePosition) {
    const segments = lines[generated.line - 1] ?? [];
    const column = generated.column - 1;
    const segment = segments.findLast(candidate => candidate.generatedColumn <= column);
    const isSegmentMissing = segment === undefined;
    if (isSegmentMissing) {
      return generated;
    }

    return {
      line: segment.sourceLine + 1,
      column: segment.sourceColumn + (column - segment.generatedColumn) + 1
    };
  }

  return mapPosition;
}
