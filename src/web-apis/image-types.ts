import type { ImageData } from "#src/win2d/context-2d/image-data.js";

/** The image media types the codecs name. */
export const ImageMimeType = {
  PNG: "image/png",
  JPEG: "image/jpeg",
  WEBP: "image/webp",
  GIF: "image/gif",
  BMP: "image/bmp",
  TIFF: "image/tiff"
} as const;
/** One of the values of `ImageMimeType`. */
export type ImageMimeType = (typeof ImageMimeType)[keyof typeof ImageMimeType];

/** The values of `ImageBitmapOptions.imageOrientation`. */
export const ImageOrientation = {
  FROM_IMAGE: "from-image",
  NONE: "none",
  FLIP_Y: "flipY"
} as const;
/** One of the values of `ImageOrientation`. */
export type ImageOrientation = (typeof ImageOrientation)[keyof typeof ImageOrientation];

/** The values of `ImageBitmapOptions.resizeQuality`. */
export const ResizeQuality = {
  PIXELATED: "pixelated",
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
} as const;
/** One of the values of `ResizeQuality`. */
export type ResizeQuality = (typeof ResizeQuality)[keyof typeof ResizeQuality];

/** One image of a file, opened for decoding. */
export interface ImageSession {
  /** The media type the file turned out to be, in lower case. */
  readonly type: string;
  readonly frameCount: number;

  /**
   * Decodes one frame.
   *
   * @param options - The frame's index, and whether the file's own rotation (its Exif orientation) is applied.
   * @returns The frame as straight-alpha RGBA.
   */
  decodeFrame(options: {
    readonly frameIndex: number;
    readonly isOrientationApplied: boolean;
  }): Promise<ImageData>;
}

/** What `ImageCodec.encode` is given. */
export interface ImageEncodeRequest {
  readonly image: ImageData;
  readonly type: string;

  /** 0 to 1; only a lossy type (JPEG) reads it. */
  readonly quality: number | undefined;
}

/** The one interface the Windows codec (`windowsImageCodec`) and the tests implement. */
export interface ImageCodec {
  /** Whether a media type can be decoded. */
  canDecode(type: string): boolean;

  /** Whether a media type can be encoded. */
  canEncode(type: string): boolean;

  /** Opens the bytes of an image file; rejects when no codec reads them. */
  open(bytes: Uint8Array): Promise<ImageSession>;

  /** Encodes pixels to the bytes of a file of the type. */
  encode(request: ImageEncodeRequest): Promise<Uint8Array>;
}
