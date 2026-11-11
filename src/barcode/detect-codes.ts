import type { Bounds, DetectCodesOptions, DetectedCode, Point } from "./barcode-types.ts";
import { Symbology } from "./barcode-types.ts";
import { binarizeAdaptive, binarizeGlobal, toLuminance } from "./binarize.ts";
import type { BitMatrix } from "./bit-matrix.ts";
import { detectLinearCodes } from "./linear/linear-detect.ts";
import { detectQrCodes } from "./qr/qr-detect.ts";
import { clippedBoxOf } from "#src/web-apis/shape-detection/text-geometry.js";

const BYTES_PER_PIXEL = 4;
const LINEAR_FORMATS: readonly Symbology[] = [
  Symbology.EAN_13,
  Symbology.EAN_8,
  Symbology.UPC_A,
  Symbology.CODE_128
];

interface Found {
  readonly format: Symbology;
  readonly text: string;
  readonly corners: readonly Point[];
}

interface Size {
  readonly width: number;
  readonly height: number;
}

function hasUsableInput({ pixels, width, height }: DetectCodesOptions) {
  const isSized = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
  return isSized && pixels.length >= width * height * BYTES_PER_PIXEL;
}

function hasPositiveArea(area: Size) {
  return area.width > 0 && area.height > 0;
}

function searchMatrix({ matrix, formats }: {
  readonly matrix: BitMatrix;
  readonly formats: ReadonlySet<Symbology>;
}) {
  const found: Found[] = [];
  if (formats.has(Symbology.QR_CODE)) {
    const upright = detectQrCodes(matrix);
    const detections = upright.length > 0 ? upright : detectQrCodes(matrix.inverted());
    for (const detection of detections) {
      found.push({
        format: Symbology.QR_CODE,
        ...detection
      });
    }
  }

  const hasLinear = LINEAR_FORMATS.some(format => formats.has(format));
  if (hasLinear) {
    found.push(
      ...detectLinearCodes({
        matrix,
        formats
      })
    );
  }

  return found;
}

function boundsOf({ corners, image }: {
  readonly corners: readonly Point[];
  readonly image: Size;
}) {
  const xValues = corners.map(corner => corner.x);
  const yValues = corners.map(corner => corner.y);
  const left = Math.max(0, Math.floor(Math.min(...xValues)));
  const top = Math.max(0, Math.floor(Math.min(...yValues)));
  const right = Math.min(image.width, Math.ceil(Math.max(...xValues)));
  const bottom = Math.min(image.height, Math.ceil(Math.max(...yValues)));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function centerOf(bounds: Bounds) {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
}

function isDuplicate({ left, right }: {
  readonly left: DetectedCode;
  readonly right: DetectedCode;
}) {
  const isSame = left.format === right.format && left.text === right.text;
  const from = centerOf(left.bounds);
  const to = centerOf(right.bounds);
  const distance = Math.hypot(from.x - to.x, from.y - to.y);
  return isSame && distance <= Math.max(left.bounds.width, left.bounds.height);
}

function toDetected({ code, area, image }: {
  readonly code: Found;
  readonly area: Bounds;
  readonly image: Size;
}) {
  const corners = code.corners.map(corner => ({
    x: corner.x + area.x,
    y: corner.y + area.y
  }));
  return {
    format: code.format,
    text: code.text,
    bounds: boundsOf({
      corners,
      image
    }),
    corners
  };
}

function search(options: DetectCodesOptions) {
  const area = clippedBoxOf(options);
  const isSearchable = hasPositiveArea(area) && hasUsableInput(options);
  if (!isSearchable) {
    return [];
  }

  const formats = new Set<Symbology>(options.formats ?? Object.values(Symbology));
  const luminance = toLuminance({
    pixels: options.pixels,
    stride: options.width,
    area
  });
  for (const binarize of [binarizeGlobal, binarizeAdaptive]) {
    const found = searchMatrix({
      matrix: binarize(luminance),
      formats
    });
    const codes: DetectedCode[] = [];
    for (const code of found) {
      const detected = toDetected({
        code,
        area,
        image: options
      });
      const isRepeat = codes.some(other => isDuplicate({
        left: other,
        right: detected
      }));
      if (!isRepeat) {
        codes.push(detected);
      }
    }

    const hasCodes = codes.length > 0;
    if (hasCodes) {
      return codes;
    }
  }
  return [];
}

/**
 * Finds and decodes QR codes (model 2, every version, any rotation, mirrored
 * or inverted, with Reed-Solomon error correction), EAN-13, EAN-8, UPC-A and
 * Code 128 in RGBA pixels, for example a cropped screenshot.
 * Linear codes are read when horizontal or vertical, in either direction.
 * Never throws: an image with nothing readable, or bad input, gives `[]`.
 *
 * @param options - The pixels, their size, and optionally a region and the formats to look for.
 * @returns Each code with its format, text, bounds and corners in the source image's pixels.
 */
export function detectCodes(options: DetectCodesOptions) {
  try {
    return search(options);
  } catch {
    return [];
  }
}
