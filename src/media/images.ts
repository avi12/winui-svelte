import { decodeDataUri, isDataUri } from "./data-uri.ts";
import { BitmapImage, SvgImageSource, Uri } from "#src/components/generated/bindings.js";
import { fillImage } from "#src/components/media.js";
import type { BitmapCreateOptions } from "#winui/microsoft/ui/xaml/media/imaging/BitmapCreateOptions";
import type { DecodePixelType } from "#winui/microsoft/ui/xaml/media/imaging/DecodePixelType";

// Image sources WinUI cannot make from a bare prop: a `data:` URI, bytes with
// decode options, SVG markup. Each returns the WinUI object, which fills itself
// when the bytes are decoded; a bad image raises the object's own failure event
// (`ImageFailed` on an Image, `OpenFailed` on an SvgImageSource).

const MARKUP_START = "<";

/** An image file's bytes, its text (SVG markup) or a URI WinUI opens (`https://`, `ms-appx://`, a file path) or a `data:` URI. */
export type ImageInput = string | Uint8Array | ArrayBuffer;

/** The decode options of a `BitmapImage`, by WinUI's names. */
export interface BitmapImageOptions {
  /**
   * Runs when decoding bytes or a `data:` URI fails. A URI that fails raises
   * the Image's `ImageFailed` instead; WinUI raises no event for bytes.
   */
  onFailed?: (error: unknown) => void;

  /** The width to decode at, in pixels; 0 decodes at the file's own size. */
  decodePixelWidth?: number;
  decodePixelHeight?: number;
  decodePixelType?: DecodePixelType;
  createOptions?: BitmapCreateOptions;

  /** Whether an animated GIF, WebP or APNG plays as soon as it is shown. */
  autoPlay?: boolean;
}

/** The raster size of an `SvgImageSource`, by WinUI's names. */
export interface SvgImageSourceOptions {
  /** Runs when reading markup, bytes or a `data:` URI fails; a URI that fails raises `OpenFailed`. */
  onFailed?: (error: unknown) => void;

  /**
   * The width in pixels the SVG is rendered at, which a bigger Image then
   * scales as pixels: set it to the Image's width times `RasterizationScale`
   * for a sharp picture on a high-DPI screen.
   */
  rasterizePixelWidth?: number;
  rasterizePixelHeight?: number;
}

function bytesOf(input: ImageInput) {
  const isBuffer = input instanceof ArrayBuffer;
  if (isBuffer) {
    return new Uint8Array(input);
  }

  const isText = typeof input === "string";
  if (!isText) {
    return input;
  }

  return isDataUri(input) ? decodeDataUri(input).bytes : new TextEncoder().encode(input);
}

function isUri(input: ImageInput) {
  return typeof input === "string" && !isDataUri(input) && !input.trimStart().startsWith(MARKUP_START);
}

function load({ image, source, onFailed }: {
  image: BitmapImage | SvgImageSource;
  source: ImageInput;
  onFailed: ((error: unknown) => void) | undefined;
}) {
  const isUriSource = typeof source === "string" && isUri(source);
  if (isUriSource) {
    image.uriSource = new Uri(source);
    return image;
  }

  fillImage({
    bytes: bytesOf(source),
    image
  }).catch((error: unknown) => onFailed?.(error));
  return image;
}

/**
 * A `BitmapImage` (PNG, JPEG, GIF, BMP, ICO, TIFF, and WebP, AVIF or HEIC
 * where Windows has the codec) made from a URI, a `data:` URI or the bytes of
 * a file, with the decode options set before it loads.
 *
 * @returns The image, to give an `Image` as its `source`.
 */
export function bitmapImageOf({ source, onFailed, ...options }: BitmapImageOptions & {
  source: ImageInput;
}) {
  const image = new BitmapImage();
  Object.assign(image, options);
  return load({
    image,
    source,
    onFailed
  });
}

/**
 * An `SvgImageSource` made from SVG markup, a `.svg` URI, a `data:` URI or the
 * bytes of an SVG file. WinUI renders static SVG 1.1 with a subset of SVG 2:
 * no scripts, no animation, and only the CSS in a `style` attribute or a
 * `<style>` element.
 *
 * @returns The source, to give an `Image` or an `ImageIcon` as its `source`.
 */
export function svgImageSourceOf({ source, onFailed, ...options }: SvgImageSourceOptions & {
  source: ImageInput;
}) {
  const image = new SvgImageSource();
  Object.assign(image, options);
  return load({
    image,
    source,
    onFailed
  });
}
