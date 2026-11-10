import { CaptureFormat } from "./format.ts";
import type { CapturePlan, Size } from "./region.ts";
import { clear } from "#src/win2d/draw.js";
import { CanvasAlphaMode } from "#winui/microsoft/graphics/canvas/CanvasAlphaMode";
import type { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import type { CanvasDevice } from "#winui/microsoft/graphics/canvas/CanvasDevice";
import type { CanvasImageInterpolation } from "#winui/microsoft/graphics/canvas/CanvasImageInterpolation";
import { CanvasRenderTarget } from "#winui/microsoft/graphics/canvas/CanvasRenderTarget";
import { DirectXPixelFormat } from "#winui/windows/graphics/direct-x/DirectXPixelFormat";

// The crop and the downscale, on the GPU: the captured surface is drawn, the
// part of it the region covers, into a render target of the output size, and
// only that is read back (about 100 KB for a tile, not 33 MB for a 4K frame).

const TARGET_DPI = 96;
const OPAQUE = 1;
const BLACK = {
  a: 255,
  r: 0,
  g: 0,
  b: 0
};

const PIXEL_FORMATS = {
  [CaptureFormat.RGBA]: DirectXPixelFormat.R8G8B8A8UIntNormalized,
  [CaptureFormat.BGRA]: DirectXPixelFormat.B8G8R8A8UIntNormalized
} as const;

/** What `createRegionRenderer` is given. */
export interface RegionRendererOptions {
  readonly device: CanvasDevice;
  readonly format: CaptureFormat;
  readonly interpolation: CanvasImageInterpolation;
}

/**
 * A render target that is kept between frames while the output size stays the
 * same, and made again when it changes.
 *
 * @param options - The device, the byte order of the result and how to resample.
 * @returns `render` and `close`.
 */
export function createRegionRenderer({ device, format, interpolation }: RegionRendererOptions) {
  let target: CanvasRenderTarget | undefined = undefined;
  let targetSize: Size | undefined = undefined;

  function targetOf(size: Size) {
    const kept = target;
    const isCurrent = kept !== undefined && targetSize?.width === size.width && targetSize.height === size.height;
    if (isCurrent) {
      return kept;
    }

    kept?.close();
    const created = CanvasRenderTarget.createWithWidthAndHeightAndDpiAndFormatAndAlpha(
      device,
      size.width,
      size.height,
      TARGET_DPI,
      PIXEL_FORMATS[format],
      CanvasAlphaMode.Ignore
    );
    target = created;
    targetSize = size;
    return created;
  }

  return {
    /**
     * Draws what the plan says and reads it back.
     *
     * @param options - The captured bitmap, the plan and the output size.
     * @returns A fresh array of `size.width * size.height * 4` bytes.
     */
    render({ bitmap, plan, size }: {
      bitmap: CanvasBitmap;
      plan: CapturePlan;
      size: Size;
    }) {
      const current = targetOf(size);
      const session = current.createDrawingSession();
      try {
        clear({
          session,
          color: BLACK
        });
        const { source, destination } = plan;
        const isDrawn = source !== undefined && destination !== undefined;
        if (isDrawn) {
          session.drawImage(bitmap, destination, source, OPAQUE, interpolation);
        }
      } finally {
        session.close();
      }

      return new Uint8Array(current.getPixelBytes());
    },
    close() {
      target?.close();
      target = undefined;
      targetSize = undefined;
    }
  };
}
