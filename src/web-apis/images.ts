import { DomErrorName, domException } from "./dom-exception.ts";
import { windowsImageCodec } from "./image-codec-windows.ts";
import { croppedImage, flippedVertically, premultipliedBgra, resizedImage } from "./image-pixels.ts";
import type { ImageCodec } from "./image-types.ts";
import { ImageMimeType, ImageOrientation, ResizeQuality } from "./image-types.ts";
import { defineProperty } from "./install.ts";
import { pngBytesOf } from "./png-writer.ts";
import { CanvasElement } from "#src/win2d/context-2d/canvas-element.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import { sharedDevice } from "#src/win2d/resources.js";
import { CanvasAlphaMode } from "#winui/microsoft/graphics/canvas/CanvasAlphaMode";
import { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import { DirectXPixelFormat } from "#winui/microsoft/graphics/direct-x/DirectXPixelFormat";
import { DataWriter } from "#winui/windows/storage/streams/DataWriter";

// createImageBitmap, ImageDecoder and the canvas encoders over the Windows
// imaging codecs. The decoded pixels are kept as straight-alpha RGBA (an
// ImageData) and become a Win2D bitmap only when something draws them.

const DPI = 96;
const PNG_DATA_PREFIX = "data:image/png;base64,";
const EMPTY_DATA_URL = "data:,";
const CANVAS_KIND = "2d";
const OPEN_FAILED = "The source image could not be decoded";

/** What `createImageBitmap` reads the bytes of: a `Blob`, a `File`, a `NativeFile`. */
export interface BlobSource {
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** What `createImageBitmap` takes: an encoded image file, pixels, another bitmap or a canvas. */
export type ImageBitmapSource = BlobSource | ImageData | ImageBitmap | CanvasElement;

/** The options `createImageBitmap` takes; the ones the platform has and Windows cannot honor are read and ignored. */
export interface ImageBitmapOptions {
  /** `from-image` (the default) applies the file's own rotation; `flipY` flips the picture upside down. */
  readonly imageOrientation?: ImageOrientation;
  readonly resizeWidth?: number;
  readonly resizeHeight?: number;
  readonly resizeQuality?: ResizeQuality;

  /** Accepted, no effect: the pixels are kept straight and premultiplied when drawn. */
  readonly premultiplyAlpha?: "none" | "premultiply" | "default";

  /** Accepted, no effect: an image is color managed to sRGB. */
  readonly colorSpaceConversion?: "none" | "default";
}

interface Installed {
  readonly codec: ImageCodec;
}

let installed: Installed | undefined;

function activeCodec() {
  if (!installed) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The image codecs are not installed: call installImageCodecs() first"
    });
  }

  return installed.codec;
}

// The generated createFromBytes sends any object, a Uint8Array included, down its IBuffer path.
function bufferOf(bytes: Uint8Array) {
  const writer = new DataWriter();
  writer.writeBytes(bytes);
  return writer.detachBuffer();
}

function isBlobSource(value: unknown): value is BlobSource {
  const isObject = typeof value === "object" && value !== null;
  return isObject && "arrayBuffer" in value && typeof value.arrayBuffer === "function";
}

/**
 * The web `ImageBitmap`: decoded pixels `drawImage` and `createPattern` take.
 * `createImageBitmap` makes one; `close()` frees it.
 */
export class ImageBitmap {
  private pixels: ImageData | undefined;
  private native: CanvasBitmap | undefined;

  constructor(image: ImageData) {
    this.pixels = image;
  }

  /** The width in pixels; 0 once closed. */
  get width() {
    return this.pixels?.width ?? 0;
  }

  /** The height in pixels; 0 once closed. */
  get height() {
    return this.pixels?.height ?? 0;
  }

  /**
   * The Win2D bitmap on the shared device, made on first use; this is what
   * `Context2D.drawImage` draws.
   *
   * @throws {DOMException} `InvalidStateError` once closed.
   */
  get target() {
    const pixels = this.toImageData();
    this.native ??= CanvasBitmap.createFromBytes(
      sharedDevice(),
      bufferOf(premultipliedBgra(pixels)),
      pixels.width,
      pixels.height,
      DirectXPixelFormat.B8G8R8A8UIntNormalized,
      DPI,
      CanvasAlphaMode.Premultiplied
    );
    return this.native;
  }

  /**
   * Extra: the pixels as RGBA, not premultiplied.
   *
   * @returns The bitmap's own pixels; do not change them.
   * @throws {DOMException} `InvalidStateError` once closed.
   */
  toImageData() {
    if (!this.pixels) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The ImageBitmap is closed"
      });
    }

    return this.pixels;
  }

  /** Frees the pixels; the bitmap is then 0 by 0 and cannot be drawn. */
  close() {
    this.native?.close();
    this.native = undefined;
    this.pixels = undefined;
  }

  get [Symbol.toStringTag]() {
    return "ImageBitmap";
  }
}

function readCanvas(canvas: CanvasElement) {
  const isEmpty = canvas.width === 0 || canvas.height === 0;
  if (isEmpty) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The canvas has no pixels"
    });
  }

  const context = canvas.getContext(CANVAS_KIND);
  const isUnavailable = context === null;
  if (isUnavailable) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "The canvas has no 2d context"
    });
  }

  return context.getImageData(0, 0, canvas.width, canvas.height);
}

async function decodeBlob({ blob, isOrientationApplied }: {
  blob: BlobSource;
  isOrientationApplied: boolean;
}) {
  const codec = activeCodec();
  const isTypeKnown = blob.type !== "";
  const isTypeRefused = isTypeKnown && !codec.canDecode(blob.type);
  if (isTypeRefused) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: `${OPEN_FAILED}: no codec reads ${blob.type}`
    });
  }

  try {
    const session = await codec.open(new Uint8Array(await blob.arrayBuffer()));
    return await session.decodeFrame({
      frameIndex: 0,
      isOrientationApplied
    });
  } catch (error: unknown) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: `${OPEN_FAILED}: ${error instanceof Error ? error.message : String(error)}`
    });
  }
}

function imageOf({ source, isOrientationApplied }: {
  source: ImageBitmapSource;
  isOrientationApplied: boolean;
}) {
  const isBitmap = source instanceof ImageBitmap;
  if (isBitmap) {
    return source.toImageData();
  }

  const isPixels = source instanceof ImageData;
  if (isPixels) {
    return source;
  }

  const isCanvas = source instanceof CanvasElement;
  if (isCanvas) {
    return readCanvas(source);
  }

  const isBlob = isBlobSource(source);
  if (!isBlob) {
    throw new TypeError("createImageBitmap takes a Blob, ImageData, ImageBitmap or canvas");
  }

  return decodeBlob({
    blob: source,
    isOrientationApplied
  });
}

/**
 * Extra: the RGBA pixels of any `ImageBitmapSource`, as `createImageBitmap`
 * would read it (an image file is decoded with its own rotation applied).
 *
 * @param source - A `Blob`, `File`, `NativeFile`, `ImageData`, `ImageBitmap` or canvas.
 * @returns The pixels; do not change them.
 * @throws {TypeError} For anything else.
 * @throws {DOMException} `InvalidStateError` when a file cannot be decoded.
 */
export function imageDataOf(source: ImageBitmapSource) {
  return imageOf({
    source,
    isOrientationApplied: true
  });
}

function sizeOfResize({ image, options }: {
  image: ImageData;
  options: ImageBitmapOptions;
}) {
  const { resizeWidth, resizeHeight } = options;
  const isWidthGiven = resizeWidth !== undefined;
  const isHeightGiven = resizeHeight !== undefined;
  const isUnchanged = !isWidthGiven && !isHeightGiven;
  if (isUnchanged) {
    return undefined;
  }

  const aspect = image.width / image.height;
  const width = resizeWidth ?? Math.round((resizeHeight ?? 0) * aspect);
  const height = resizeHeight ?? Math.round(width / aspect);
  const isValid = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0;
  if (!isValid) {
    throw domException({
      name: DomErrorName.INVALID_STATE,
      message: "resizeWidth and resizeHeight must be positive integers"
    });
  }

  return {
    width,
    height
  };
}

function rectangleOf(numbers: readonly [number, number, number, number]) {
  const [x, y, width, height] = numbers;
  const isFinite = numbers.every(Number.isFinite);
  const isEmpty = width === 0 || height === 0;
  const isUnusable = !isFinite || isEmpty;
  if (isUnusable) {
    throw new RangeError("The source rectangle must have a width and a height");
  }

  return {
    x,
    y,
    width,
    height
  };
}

/**
 * The web `createImageBitmap`: decodes an image file, or copies pixels, to an
 * `ImageBitmap`, optionally cropped to a source rectangle and resized.
 *
 * @param image - A `Blob` (or `File`, `NativeFile`) of an image file, `ImageData`, an `ImageBitmap` or a canvas.
 * @param first - The options, or the left of the source rectangle.
 * @param top - The top of the source rectangle.
 * @param width - The width of the source rectangle.
 * @param height - The height of the source rectangle.
 * @param last - The options, after a source rectangle.
 * @returns The bitmap.
 * @throws {DOMException} `InvalidStateError` when the file cannot be decoded; `RangeError` for an empty rectangle.
 */
export function createImageBitmap(image: ImageBitmapSource, options?: ImageBitmapOptions): Promise<ImageBitmap>;
export function createImageBitmap(
  image: ImageBitmapSource,
  left: number,
  top: number,
  width: number,
  height: number,
  options?: ImageBitmapOptions
): Promise<ImageBitmap>;
export async function createImageBitmap(
  image: ImageBitmapSource,
  first?: number | ImageBitmapOptions,
  top?: number,
  width?: number,
  height?: number,
  last?: ImageBitmapOptions
) {
  const isCropped = typeof first === "number";
  const options = (isCropped ? last : first) ?? {};
  const isOrientationApplied = options.imageOrientation !== ImageOrientation.NONE;
  let pixels = await imageOf({
    source: image,
    isOrientationApplied
  });
  if (isCropped) {
    pixels = croppedImage({
      image: pixels,
      rectangle: rectangleOf([first, top ?? Number.NaN, width ?? Number.NaN, height ?? Number.NaN])
    });
  }

  const size = sizeOfResize({
    image: pixels,
    options
  });
  if (size) {
    pixels = resizedImage({
      image: pixels,
      ...size,
      quality: options.resizeQuality ?? ResizeQuality.LOW
    });
  }

  const isFlipped = options.imageOrientation === ImageOrientation.FLIP_Y;
  return new ImageBitmap(isFlipped ? flippedVertically(pixels) : pixels);
}

/** One sequence of frames in an image file; a Windows image file has exactly one. */
export class ImageTrack {
  readonly animated: boolean;
  readonly frameCount: number;

  /** `Infinity` for an animation: Windows does not say how often a GIF loops. */
  readonly repetitionCount: number;
  selected = true;

  constructor(frameCount: number) {
    this.frameCount = frameCount;
    this.animated = frameCount > 1;
    this.repetitionCount = this.animated ? Infinity : 0;
  }
}

/** The tracks of an `ImageDecoder`: one, once the file is read. */
export class ImageTrackList {
  readonly ready: Promise<void>;
  private readonly list: ImageTrack[] = [];

  constructor(ready: Promise<number>) {
    this.ready = ready.then(frameCount => {
      this.list.push(new ImageTrack(frameCount));
    });
  }

  get length() {
    return this.list.length;
  }

  get selectedIndex() {
    return this.list.length - 1;
  }

  get selectedTrack() {
    return this.list[0] ?? null;
  }

  item(index: number) {
    return this.list[index];
  }
}

/** What `new ImageDecoder` takes. */
export interface ImageDecoderInit {
  /** The bytes of the file, or a stream of them. */
  readonly data: BufferSource | ReadableStream<Uint8Array>;

  /** The media type of the file. */
  readonly type: string;

  /** Accepted, no effect. */
  readonly colorSpaceConversion?: "none" | "default";

  /** Whether the file's own rotation (Exif orientation) is ignored; extra, false by default. */
  readonly isOrientationIgnored?: boolean;
}

/** What `ImageDecoder.decode` takes. */
export interface ImageDecodeOptions {
  readonly frameIndex?: number;

  /** Accepted: every frame is decoded whole. */
  readonly completeFramesOnly?: boolean;
}

/** What `ImageDecoder.decode` resolves with. */
export interface ImageDecodeResult {
  /** The frame, as an `ImageBitmap` (the web has a `VideoFrame`, which a window thread does not). */
  readonly image: ImageBitmap;
  readonly complete: boolean;
}

async function bytesOfData(data: ImageDecoderInit["data"]) {
  const isStream = data instanceof ReadableStream;
  if (!isStream) {
    return new Uint8Array(ArrayBuffer.isView(data)
      ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
      : data.slice(0));
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of data) {
    chunks.push(chunk);
  }

  return new Uint8Array(Buffer.concat(chunks));
}

/**
 * The web `ImageDecoder`: decodes the frames of an image file, so an animated
 * GIF can be drawn frame by frame. Windows hands back each GIF frame as the
 * file stores it, which for an optimized GIF is the changed area only.
 */
export class ImageDecoder {
  readonly type: string;
  readonly tracks: ImageTrackList;
  readonly completed: Promise<void>;
  private isComplete = false;
  private isClosed = false;
  private readonly session: ReturnType<ImageCodec["open"]>;
  private readonly isOrientationApplied: boolean;

  /**
   * Starts reading the data.
   *
   * @throws {DOMException} `NotSupportedError` when Windows has no codec for `type`.
   */
  constructor(init: ImageDecoderInit) {
    const codec = activeCodec();
    const isSupported = codec.canDecode(init.type);
    if (!isSupported) {
      throw domException({
        name: DomErrorName.NOT_SUPPORTED,
        message: `No codec reads ${init.type}`
      });
    }

    this.type = init.type;
    this.isOrientationApplied = init.isOrientationIgnored !== true;
    this.session = bytesOfData(init.data).then(bytes => codec.open(bytes));
    this.tracks = new ImageTrackList(this.session.then(session => session.frameCount));
    this.completed = this.session.then(() => {
      this.isComplete = true;
    });
  }

  /** Whether all the data has arrived and been read. */
  get complete() {
    return this.isComplete;
  }

  /**
   * Decodes a frame.
   *
   * @param options - The `frameIndex` (0 by default).
   * @returns The frame.
   * @throws {RangeError} when the file has no such frame.
   * @throws {DOMException} `InvalidStateError` once closed or when the file cannot be read.
   */
  async decode(options: ImageDecodeOptions = {}) {
    if (this.isClosed) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The ImageDecoder is closed"
      });
    }

    const frameIndex = options.frameIndex ?? 0;
    const session = await this.session.catch((error: unknown) => {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: `${OPEN_FAILED}: ${error instanceof Error ? error.message : String(error)}`
      });
    });
    const isInRange = Number.isInteger(frameIndex) && frameIndex >= 0 && frameIndex < session.frameCount;
    if (!isInRange) {
      throw new RangeError(`The image has ${session.frameCount} frames; there is no frame ${frameIndex}`);
    }

    const pixels = await session.decodeFrame({
      frameIndex,
      isOrientationApplied: this.isOrientationApplied
    });
    return {
      image: new ImageBitmap(pixels),
      complete: true
    };
  }

  /** Does nothing: every frame is decoded whole and on request. */
  reset() {}

  /** Stops the decoder; `decode` then rejects. */
  close() {
    this.isClosed = true;
  }

  /**
   * Whether Windows can decode a media type.
   *
   * @param type - A media type such as `image/gif`.
   * @returns True for a type a codec reads.
   */
  static async isTypeSupported(type: string) {
    return activeCodec().canDecode(type);
  }

  get [Symbol.toStringTag]() {
    return "ImageDecoder";
  }
}

/** What a canvas encoder takes besides the canvas. */
interface EncodeOptions {
  readonly canvas: CanvasElement;
  readonly type: string | undefined;
  readonly quality: unknown;
}

function qualityOf(quality: unknown) {
  return typeof quality === "number" ? quality : undefined;
}

// The type that is encoded: the one asked for when Windows can write it, else PNG, as the platform does.
function encodedType({ codec, type }: {
  codec: ImageCodec;
  type: string | undefined;
}) {
  const asked = (type ?? ImageMimeType.PNG).toLowerCase();
  return codec.canEncode(asked) ? asked : ImageMimeType.PNG;
}

async function encodeCanvas({ canvas, type, quality }: EncodeOptions) {
  const codec = activeCodec();
  const isEmpty = canvas.width === 0 || canvas.height === 0;
  if (isEmpty) {
    return undefined;
  }

  const encoded = encodedType({
    codec,
    type
  });
  const bytes = await codec.encode({
    image: readCanvas(canvas),
    type: encoded,
    quality: qualityOf(quality)
  });
  return new Blob([bytes.slice()], { type: encoded });
}

/** What `convertToBlob` takes. */
export interface ImageEncodeOptions {
  readonly type?: string;
  readonly quality?: number;
}

/** The members `installImageCodecs` adds to a canvas. */
export interface CanvasEncoders {
  /**
   * Encodes the canvas and calls back with the file, or with null when it has
   * no pixels or encoding failed. A type Windows cannot write (WebP) gives a PNG.
   */
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;

  /** The `OffscreenCanvas` form of `toBlob`: a promise of the file. */
  convertToBlob(options?: ImageEncodeOptions): Promise<Blob>;

  /**
   * A `data:` URL of the canvas. It is synchronous, and every Windows encoder
   * is asynchronous, so it is always a PNG whatever the type; use
   * `toDataURLAsync` for JPEG and the rest.
   */
  toDataURL(type?: string, quality?: number): string;

  /** Extra: a `data:` URL of the canvas in the type asked for (PNG when Windows cannot write it). */
  toDataURLAsync(type?: string, quality?: number): Promise<string>;
}

declare module "#src/win2d/context-2d/canvas-element.js" {
  // The encoders join the canvas wherever this module is imported.
  interface CanvasElement extends CanvasEncoders {}
}

async function dataUrlOf(options: EncodeOptions) {
  const blob = await encodeCanvas(options);
  if (!blob) {
    return EMPTY_DATA_URL;
  }

  const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");
  return `data:${blob.type};base64,${base64}`;
}

const canvasEncoders = {
  toBlob(this: CanvasElement, callback: (blob: Blob | null) => void, type?: string, quality?: number) {
    encodeCanvas({
      canvas: this,
      type,
      quality
    }).then(blob => callback(blob ?? null), () => callback(null));
  },
  async convertToBlob(this: CanvasElement, options: ImageEncodeOptions = {}) {
    const blob = await encodeCanvas({
      canvas: this,
      type: options.type,
      quality: options.quality
    });
    if (!blob) {
      throw domException({
        name: DomErrorName.INVALID_STATE,
        message: "The canvas has no pixels"
      });
    }

    return blob;
  },
  toDataURL(this: CanvasElement, _type?: string, _quality?: number) {
    const isEmpty = this.width === 0 || this.height === 0;
    if (isEmpty) {
      return EMPTY_DATA_URL;
    }

    return PNG_DATA_PREFIX + pngBytesOf(readCanvas(this)).toString("base64");
  },
  toDataURLAsync(this: CanvasElement, type?: string, quality?: number) {
    return dataUrlOf({
      canvas: this,
      type,
      quality
    });
  }
};

/** What `installImageCodecs` takes. */
export interface ImageCodecsInstallOptions {
  /** Stands in for Windows' codecs; the tests give one. */
  readonly codec?: ImageCodec;
}

/**
 * Defines `createImageBitmap`, `ImageBitmap` and `ImageDecoder`, and adds
 * `toBlob`, `convertToBlob`, `toDataURL` (and the extra `toDataURLAsync`) to
 * `CanvasElement`. Nothing is defined until this is called.
 *
 * @param options - Test stand-ins.
 * @returns The function that takes it all away again.
 */
export function installImageCodecs(options: ImageCodecsInstallOptions = {}) {
  const previous = installed;
  installed = { codec: options.codec ?? windowsImageCodec() };
  const uninstalls = [
    defineProperty({
      name: "createImageBitmap",
      value: createImageBitmap
    }),
    defineProperty({
      name: "ImageBitmap",
      value: ImageBitmap
    }),
    defineProperty({
      name: "ImageDecoder",
      value: ImageDecoder
    }),
    ...Object.entries(canvasEncoders).map(([name, value]) => defineProperty({
      name,
      value,
      target: CanvasElement.prototype
    }))
  ];
  return () => {
    for (const uninstall of uninstalls.reverse()) {
      uninstall();
    }

    installed = previous;
  };
}
