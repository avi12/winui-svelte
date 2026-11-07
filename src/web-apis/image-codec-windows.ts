import { flattenedOverBlack, swapRedBlue } from "./image-pixels.ts";
import type { ImageCodec, ImageEncodeRequest } from "./image-types.ts";
import { ImageMimeType } from "./image-types.ts";
import { streamOf } from "#src/components/byte-stream.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import { PropertyType } from "#winui/windows/foundation/PropertyType";
import { PropertyValue } from "#winui/windows/foundation/PropertyValue";
import { BitmapAlphaMode } from "#winui/windows/graphics/imaging/BitmapAlphaMode";
import type { BitmapCodecInformation } from "#winui/windows/graphics/imaging/BitmapCodecInformation";
import { BitmapDecoder } from "#winui/windows/graphics/imaging/BitmapDecoder";
import { BitmapEncoder } from "#winui/windows/graphics/imaging/BitmapEncoder";
import { BitmapPixelFormat } from "#winui/windows/graphics/imaging/BitmapPixelFormat";
import { BitmapPropertySet } from "#winui/windows/graphics/imaging/BitmapPropertySet";
import { BitmapTransform } from "#winui/windows/graphics/imaging/BitmapTransform";
import { BitmapTypedValue } from "#winui/windows/graphics/imaging/BitmapTypedValue";
import { ColorManagementMode } from "#winui/windows/graphics/imaging/ColorManagementMode";
import { ExifOrientationMode } from "#winui/windows/graphics/imaging/ExifOrientationMode";
import { DataReader } from "#winui/windows/storage/streams/DataReader";
import { InMemoryRandomAccessStream } from "#winui/windows/storage/streams/InMemoryRandomAccessStream";

// BitmapDecoder and BitmapEncoder behind the ImageCodec interface. They need
// no window and no package identity, only a started WinRT apartment.

const DEFAULT_DPI = 96;
const START = 0n;
const QUALITY_KEY = "ImageQuality";
const DEFAULT_JPEG_QUALITY = 0.92;
const MIN_QUALITY = 0;
const MAX_QUALITY = 1;

function mimeTypesOf(codec: BitmapCodecInformation) {
  return [...(codec.mimeTypes ?? [])].map(type => type.toLowerCase());
}

function qualityOf(quality: number | undefined) {
  const isUsable = typeof quality === "number" && quality >= MIN_QUALITY && quality <= MAX_QUALITY;
  return isUsable ? quality : DEFAULT_JPEG_QUALITY;
}

function encodingOptionsOf(request: ImageEncodeRequest) {
  const isLossy = request.type === ImageMimeType.JPEG;
  if (!isLossy) {
    return undefined;
  }

  const options = new BitmapPropertySet();
  const quality = BitmapTypedValue.create(PropertyValue.createSingle(qualityOf(request.quality)), PropertyType.Single);
  options.insert(QUALITY_KEY, quality);
  return options;
}

async function bytesOfStream(stream: InMemoryRandomAccessStream) {
  const size = Number(stream.size);
  stream.seek(START);
  const reader = new DataReader(stream);
  await reader.loadAsync(size);
  return new Uint8Array(reader.readBytes(new Uint8Array(size)));
}

/**
 * The real codec, over `Windows.Graphics.Imaging`. It reads and writes what
 * Windows has a codec for: BMP, GIF, ICO, JPEG, PNG, TIFF and JPEG XR, and
 * WebP, AVIF and HEIC where the codec extensions are installed; it writes
 * BMP, GIF, JPEG, PNG, TIFF, JPEG XR, HEIC and JPEG XL, but no WebP.
 *
 * @returns The codec.
 */
export function windowsImageCodec() {
  let decodable: Set<string> | undefined;
  let encoders: Map<string, string> | undefined;

  function decodableTypes() {
    decodable ??= new Set([...(BitmapDecoder.getDecoderInformationEnumerator() ?? [])].flatMap(mimeTypesOf));
    return decodable;
  }

  function encoderIds() {
    encoders ??= new Map(
      [...(BitmapEncoder.getEncoderInformationEnumerator() ?? [])].flatMap(codec =>
        mimeTypesOf(codec).map(type => [type, codec.codecId] as const))
    );
    return encoders;
  }

  return {
    canDecode: type => decodableTypes().has(type.toLowerCase()),
    canEncode: type => encoderIds().has(type.toLowerCase()),
    async open(bytes) {
      const decoder = await BitmapDecoder.createAsync(await streamOf(bytes));
      const type = mimeTypesOf(decoder.decoderInformation)[0] ?? "";
      return {
        type,
        frameCount: decoder.frameCount,
        async decodeFrame({ frameIndex, isOrientationApplied }) {
          const frame = await decoder.getFrameAsync(frameIndex);
          const exifMode = isOrientationApplied
            ? ExifOrientationMode.RespectExifOrientation
            : ExifOrientationMode.IgnoreExifOrientation;
          const pixels = await frame.getPixelDataAsync(
            BitmapPixelFormat.Bgra8,
            BitmapAlphaMode.Straight,
            new BitmapTransform(),
            exifMode,
            ColorManagementMode.ColorManageToSRgb
          );
          return new ImageData(
            new Uint8ClampedArray(swapRedBlue(pixels.detachPixelData())),
            isOrientationApplied ? frame.orientedPixelWidth : frame.pixelWidth
          );
        }
      };
    },
    async encode(request) {
      const codecId = encoderIds().get(request.type.toLowerCase());
      const isMissing = codecId === undefined;
      if (isMissing) {
        throw new Error(`Windows has no encoder for ${request.type}`);
      }

      const isLossy = request.type === ImageMimeType.JPEG;
      const image = isLossy ? flattenedOverBlack(request.image) : request.image;
      const stream = new InMemoryRandomAccessStream();
      const options = encodingOptionsOf(request);
      const encoder = options === undefined
        ? await BitmapEncoder.createAsync(codecId, stream)
        : await BitmapEncoder.createAsync(codecId, stream, options);
      encoder.setPixelData(
        BitmapPixelFormat.Bgra8,
        BitmapAlphaMode.Straight,
        image.width,
        image.height,
        DEFAULT_DPI,
        DEFAULT_DPI,
        swapRedBlue(image.data)
      );
      await encoder.flushAsync();
      return bytesOfStream(stream);
    }
  } satisfies ImageCodec;
}
