import type { Rectangle, Size } from "./region.ts";

// What the engine under `getDisplayMedia` hands the web layer: a monitor or a
// window as a source of cropped, scaled frames.

/** One picture of a captured surface, or of a region of it. */
export interface CaptureFrame {
  readonly width: number;
  readonly height: number;

  /** RGBA, four bytes a pixel, rows from the top, no padding: `width * height * 4` bytes, the frame's own. */
  readonly pixels: Uint8Array;
}

/** What a `FrameSource` is asked for. */
export interface FrameRequest {
  /** The part of the surface to show, in its physical pixels; null for all of it. */
  readonly region: Rectangle | null;

  /** The size of the picture; the region is stretched to fill it. */
  readonly size: Size;
}

/** The part of a capture that touches Windows: one surface, frames out of it. */
export interface FrameSource {
  /** The surface's size in physical pixels now. */
  surfaceSize(): Size;

  /**
   * The newest picture of the surface, cropped and scaled on the GPU and
   * read back. Windows delivers a frame only when the screen changes, so the
   * newest one is kept and drawn again for a request that differs; the ones
   * between two calls are dropped, never queued.
   *
   * @param request - The region and the size.
   * @returns The picture; undefined until Windows has delivered the first frame.
   */
  readFrame(request: FrameRequest): CaptureFrame | undefined;

  /**
   * Tells Windows the rate the frames are wanted at, so it does not draw more.
   *
   * @param framesPerSecond - The rate.
   */
  setTargetFramesPerSecond(framesPerSecond: number): void;

  /** Ends the capture and frees what it holds. */
  close(): void;
}
