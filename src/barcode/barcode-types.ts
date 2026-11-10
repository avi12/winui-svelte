/** The symbologies the engine reads, named as the Shape Detection API names them. */
export const Symbology = {
  QR_CODE: "qr_code",
  EAN_13: "ean_13",
  EAN_8: "ean_8",
  UPC_A: "upc_a",
  CODE_128: "code_128"
} as const;

/** One of the `Symbology` values. */
export type Symbology = typeof Symbology[keyof typeof Symbology];

/** A position in the source image, in pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A rectangle in the source image, in pixels. */
export interface Bounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A code `detectCodes` found and decoded. */
export interface DetectedCode {
  readonly format: Symbology;
  /** The decoded content; for EAN and UPC the digits, check digit included. */
  readonly text: string;
  /** The smallest upright rectangle around the code, in the source image's pixels. */
  readonly bounds: Bounds;
  /**
   * The four corners of the code in the source image's pixels, clockwise from
   * the top-left of the code as it reads (a QR code's finder pattern corner, a
   * linear code's first bar); a rotated code has rotated corners.
   */
  readonly corners: readonly Point[];
}

/** What `detectCodes` takes. */
export interface DetectCodesOptions {
  /** RGBA bytes, four per pixel, row by row (an `ImageData.data`, or a decoded bitmap). */
  readonly pixels: Uint8Array | Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
  /** Only this part of the image is searched; the results stay in the whole image's pixels. */
  readonly region?: Bounds;
  /** The symbologies to look for; all of them by default. */
  readonly formats?: readonly Symbology[];
}
