import { Symbology } from "#src/barcode/barcode-types.js";
import type { Bounds } from "#src/barcode/barcode-types.js";
import { detectCodes } from "#src/barcode/detect-codes.js";
import type { ImageBitmapSource } from "#src/web-apis/images.js";
import { defineProperty } from "#src/web-apis/install.js";

const SUPPORTED_FORMATS: readonly Symbology[] = Object.values(Symbology);

/** The format names of the Shape Detection API; `BarcodeDetector.getSupportedFormats()` says which this one reads. */
export type BarcodeFormat =
  | Symbology
  | "aztec"
  | "codabar"
  | "code_39"
  | "code_93"
  | "data_matrix"
  | "itf"
  | "pdf417"
  | "upc_e"
  | "unknown";

/** What `new BarcodeDetector` takes. */
export interface BarcodeDetectorOptions {
  /** The formats to look for, from `getSupportedFormats()`; all of them by default. */
  readonly formats?: readonly BarcodeFormat[];
  /** Extra: only this rectangle is searched (a Circle to Search crop); results stay in the image's pixels. */
  readonly region?: Bounds;
}

/** A corner of a detected code, in the image's pixels. */
export interface DetectedBarcodePoint {
  readonly x: number;
  readonly y: number;
}

/** A rectangle with its edges, as `DOMRectReadOnly`. */
export interface BarcodeBoundingBox extends Bounds {
  readonly top: number;
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
}

/** What `BarcodeDetector.detect` resolves with, one per code. */
export interface DetectedBarcode {
  /** The smallest upright rectangle around the code. */
  readonly boundingBox: BarcodeBoundingBox;
  /** The four corners, clockwise from the code's top-left as it reads. */
  readonly cornerPoints: readonly DetectedBarcodePoint[];
  readonly format: BarcodeFormat;
  /** The decoded text; for EAN and UPC the digits, check digit included. */
  readonly rawValue: string;
}

function isSupported(format: string): format is Symbology {
  return SUPPORTED_FORMATS.some(supported => supported === format);
}

function boundingBoxOf(bounds: Bounds) {
  return {
    ...bounds,
    top: bounds.y,
    left: bounds.x,
    right: bounds.x + bounds.width,
    bottom: bounds.y + bounds.height
  };
}

/**
 * The web `BarcodeDetector` (Shape Detection API), pure TypeScript with no
 * native code: QR codes (model 2, every version, any rotation, mirrored or
 * inverted, with error correction), EAN-13, EAN-8, UPC-A and Code 128. Linear
 * codes are read horizontal or vertical, in either direction.
 */
export class BarcodeDetector {
  private readonly formats: readonly Symbology[];
  private readonly region: Bounds | undefined;

  /**
   * Makes a detector for some formats, all of them by default.
   *
   * @param options - The formats to look for, and an extra region.
   * @throws {TypeError} When `formats` is empty or names a format this detector does not read.
   */
  constructor(options: BarcodeDetectorOptions = {}) {
    const requested = options.formats;
    const isEmpty = requested?.length === 0;
    if (isEmpty) {
      throw new TypeError("BarcodeDetector: the formats list is empty");
    }

    const unsupported = (requested ?? []).find(format => !isSupported(format));
    const hasUnsupported = unsupported !== undefined;
    if (hasUnsupported) {
      throw new TypeError(`BarcodeDetector: unsupported format '${unsupported}'`);
    }

    this.formats = requested?.filter(isSupported) ?? SUPPORTED_FORMATS;
    this.region = options.region;
  }

  /** The formats this detector reads. */
  static getSupportedFormats() {
    return Promise.resolve([...SUPPORTED_FORMATS] satisfies BarcodeFormat[]);
  }

  /**
   * Finds the codes in an image.
   *
   * @param image - A `Blob`, `File` or `NativeFile` of an image file, `ImageData`, an `ImageBitmap` or a canvas.
   * @returns The codes found, an empty array for none.
   * @throws {TypeError} For a source that is not an image.
   * @throws {DOMException} `InvalidStateError` for an image file that cannot be decoded.
   */
  async detect(image: ImageBitmapSource) {
    const { imageDataOf } = await import("#src/web-apis/images.js");
    const pixels = await imageDataOf(image);
    return detectCodes({
      pixels: pixels.data,
      width: pixels.width,
      height: pixels.height,
      formats: this.formats,
      ...this.regionOption()
    }).map(code => ({
      boundingBox: boundingBoxOf(code.bounds),
      cornerPoints: code.corners,
      format: code.format,
      rawValue: code.text
    } satisfies DetectedBarcode));
  }

  private regionOption() {
    return this.region ? { region: this.region } : {};
  }
}

/**
 * Defines `BarcodeDetector` on the global scope.
 *
 * @returns The function that takes it away again.
 */
export function installBarcodeDetector() {
  return defineProperty({
    name: "BarcodeDetector",
    value: BarcodeDetector
  });
}
