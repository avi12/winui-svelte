import { decodeCode128 } from "./code-128.ts";
import { decodeEan } from "./ean.ts";
import type { Point, Symbology } from "#src/barcode/barcode-types.js";
import { Symbology as Format } from "#src/barcode/barcode-types.js";
import type { BitMatrix } from "#src/barcode/bit-matrix.js";
import type { Run } from "#src/barcode/runs.js";
import { runsOfLine } from "#src/barcode/runs.js";

const UPC_A_DIGITS = 13;
const MAXIMUM_LINE_GAP = 4;
const MINIMUM_LINES = 2;
// Lines a symbol must read on, per pixel of module: a bar is as tall as it is wide at the least, and a
// stray match inside another symbology repeats only for as many lines as that symbology's module is high.
const LINES_PER_MODULE_PIXEL = 1.5;
const QUIET_MODULES = 3;
const GUARD_RUNS = 3;
const SYMBOL_START_RUNS = 6;
const CODE_128_START_MODULES = 11;

/** A linear code found and read, with the scan geometry that found it. */
interface LinearDetection {
  readonly format: Symbology;
  readonly text: string;
  /** Pixel corners, clockwise from the first bar's top, as the code reads. */
  readonly corners: readonly Point[];
}

interface LineHit {
  readonly format: Symbology;
  readonly text: string;
  readonly line: number;
  readonly isColumn: boolean;
  readonly isReversed: boolean;
  readonly from: number;
  readonly to: number;
  readonly moduleWidth: number;
}

function formatOfDigits({ digits, formats }: {
  readonly digits: string;
  readonly formats: ReadonlySet<Symbology>;
}) {
  const isEan13 = digits.length === UPC_A_DIGITS;
  const isUpcA = isEan13 && digits.startsWith("0") && formats.has(Format.UPC_A);
  if (isUpcA) {
    return {
      format: Format.UPC_A,
      text: digits.slice(1)
    };
  }

  const wantedFormat = isEan13 ? Format.EAN_13 : Format.EAN_8;
  return formats.has(wantedFormat) ? {
    format: wantedFormat,
    text: digits
  } : undefined;
}

// White space beside a symbol: at least a few modules, or running off the line (a crop through the quiet zone).
function hasQuietZone({ runs, start, runCount, moduleWidth }: {
  readonly runs: readonly Run[];
  readonly start: number;
  readonly runCount: number;
  readonly moduleWidth: number;
}) {
  const before = runs[start - 1];
  const after = runs[start + runCount];
  const isAtStart = before === undefined || start === 1;
  const isBeforeQuiet = isAtStart || before.width >= QUIET_MODULES * moduleWidth;
  const isAtEnd = after === undefined || start + runCount === runs.length - 1;
  const isAfterQuiet = isAtEnd || after.width >= QUIET_MODULES * moduleWidth;
  return isBeforeQuiet && isAfterQuiet;
}

// A cheap test before any decoding: a symbol's first bars are narrow next to the white space before them.
function mightStartSymbol({ runs, start }: {
  readonly runs: readonly Run[];
  readonly start: number;
}) {
  const before = runs[start - 1];
  const isAtEdge = before === undefined || start === 1;
  if (isAtEdge) {
    return true;
  }

  let firstThree = 0;
  let firstSix = 0;
  for (let i = 0; i < SYMBOL_START_RUNS; i++) {
    const width = runs[start + i]?.width ?? 0;
    firstSix += width;
    firstThree += i < GUARD_RUNS ? width : 0;
  }
  const guessedModule = Math.min(firstThree / GUARD_RUNS, firstSix / CODE_128_START_MODULES);
  return before.width >= QUIET_MODULES * guessedModule;
}

interface SymbolHit {
  readonly format: Symbology;
  readonly text: string;
  readonly from: number;
  readonly to: number;
  readonly moduleWidth: number;
}

function readEanAt({ runs, start, formats }: {
  readonly runs: readonly Run[];
  readonly start: number;
  readonly formats: ReadonlySet<Symbology>;
}) {
  const ean = decodeEan({
    runs,
    start
  });
  const typed = ean && formatOfDigits({
    digits: ean.digits,
    formats
  });
  const moduleWidth = ean ? (ean.to - ean.from) / ean.moduleCount : 0;
  const isQuiet = ean !== undefined && hasQuietZone({
    runs,
    start,
    runCount: ean.runCount,
    moduleWidth
  });
  const isSymbol = ean && typed && isQuiet;
  return isSymbol
    ? {
      ...typed,
      from: ean.from,
      to: ean.to,
      moduleWidth
    }
    : undefined;
}

function readCode128At({ runs, start }: {
  readonly runs: readonly Run[];
  readonly start: number;
}) {
  const code128 = decodeCode128({
    runs,
    start
  });
  const moduleWidth = code128 ? (code128.to - code128.from) / code128.moduleCount : 0;
  const isQuiet = code128 !== undefined && hasQuietZone({
    runs,
    start,
    runCount: code128.runCount,
    moduleWidth
  });
  const isSymbol = code128 && isQuiet;
  return isSymbol
    ? {
      format: Format.CODE_128,
      text: code128.text,
      from: code128.from,
      to: code128.to,
      moduleWidth
    }
    : undefined;
}

function readLine({ runs, formats }: {
  readonly runs: readonly Run[];
  readonly formats: ReadonlySet<Symbology>;
}) {
  const hits: SymbolHit[] = [];
  const hasEan = formats.has(Format.EAN_13) || formats.has(Format.UPC_A) || formats.has(Format.EAN_8);
  const hasCode128 = formats.has(Format.CODE_128);
  for (const [start, run] of runs.entries()) {
    const isCandidate = run.isBlack && mightStartSymbol({
      runs,
      start
    });
    const canReadEan = isCandidate && hasEan;
    const ean = canReadEan ? readEanAt({
      runs,
      start,
      formats
    }) : undefined;
    const canReadCode128 = isCandidate && hasCode128 && !ean;
    const code128 = canReadCode128 ? readCode128At({
      runs,
      start
    }) : undefined;
    const hit = ean ?? code128;
    if (hit) {
      hits.push(hit);
    }
  }
  return hits;
}

function cornersOf({ hits, isColumn, isReversed }: {
  readonly hits: readonly LineHit[];
  readonly isColumn: boolean;
  readonly isReversed: boolean;
}) {
  const lines = hits.map(hit => hit.line);
  const low = Math.min(...lines);
  const high = Math.max(...lines) + 1;
  const from = Math.min(...hits.map(hit => hit.from));
  const to = Math.max(...hits.map(hit => hit.to));
  if (isColumn) {
    return isReversed
      ? [{
        x: low,
        y: to
      }, {
        x: low,
        y: from
      }, {
        x: high,
        y: from
      }, {
        x: high,
        y: to
      }]
      : [{
        x: high,
        y: from
      }, {
        x: high,
        y: to
      }, {
        x: low,
        y: to
      }, {
        x: low,
        y: from
      }];
  }

  return isReversed
    ? [{
      x: to,
      y: high
    }, {
      x: from,
      y: high
    }, {
      x: from,
      y: low
    }, {
      x: to,
      y: low
    }]
    : [{
      x: from,
      y: low
    }, {
      x: to,
      y: low
    }, {
      x: to,
      y: high
    }, {
      x: from,
      y: high
    }];
}

function reversed(runs: readonly Run[]) {
  return [...runs].reverse();
}

function scanLines({ matrix, formats, isColumn }: {
  readonly matrix: BitMatrix;
  readonly formats: ReadonlySet<Symbology>;
  readonly isColumn: boolean;
}) {
  const hits: LineHit[] = [];
  const lineCount = isColumn ? matrix.width : matrix.height;
  for (let line = 0; line < lineCount; line++) {
    const runs = runsOfLine({
      matrix,
      index: line,
      isColumn
    });
    for (const isReversed of [false, true]) {
      const found = readLine({
        runs: isReversed ? reversed(runs) : runs,
        formats
      });
      for (const hit of found) {
        hits.push({
          ...hit,
          line,
          isColumn,
          isReversed
        });
      }
    }
  }
  return hits;
}

function groupHits(hits: readonly LineHit[]) {
  const groups: LineHit[][] = [];
  for (const hit of hits) {
    const group = groups.find(candidate => {
      const last = candidate[candidate.length - 1];
      const isSame = last?.text === hit.text && last.format === hit.format
        && last.isColumn === hit.isColumn && last.isReversed === hit.isReversed;
      const isNear = hit.line - (last?.line ?? 0) <= MAXIMUM_LINE_GAP;
      return isSame && isNear;
    });
    if (group) {
      group.push(hit);
    } else {
      groups.push([hit]);
    }
  }
  return groups;
}

/**
 * Finds the EAN, UPC and Code 128 symbols in `matrix` (black bars on white),
 * scanning every row and column, each in both directions. A symbol must read
 * the same on at least two neighbouring lines.
 */
export function detectLinearCodes({ matrix, formats }: {
  readonly matrix: BitMatrix;
  readonly formats: ReadonlySet<Symbology>;
}) {
  const hits = [
    ...scanLines({
      matrix,
      formats,
      isColumn: false
    }),
    ...scanLines({
      matrix,
      formats,
      isColumn: true
    })
  ];
  const detections: LinearDetection[] = [];
  for (const group of groupHits(hits)) {
    const [first] = group;
    const requiredLines = Math.max(MINIMUM_LINES, Math.round((first?.moduleWidth ?? 0) * LINES_PER_MODULE_PIXEL));
    const isSymbol = first && group.length >= requiredLines;
    if (isSymbol) {
      detections.push({
        format: first.format,
        text: first.text,
        corners: cornersOf({
          hits: group,
          isColumn: first.isColumn,
          isReversed: first.isReversed
        })
      });
    }
  }
  return detections;
}
