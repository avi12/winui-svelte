import type { CaptureFormat } from "./format.ts";
import type { Rectangle, Size } from "./region.ts";

/** One picture of a monitor, or of a region of it. */
export interface CaptureFrame {
  readonly width: number;
  readonly height: number;

  /** Four bytes a pixel in `format`, rows from the top, no padding: `width * height * 4` bytes, the frame's own. */
  readonly pixels: Uint8Array;
  readonly format: CaptureFormat;

  /**
   * The part of the monitor the picture shows, in the monitor's physical
   * pixels; the whole monitor when no region was asked.
   */
  readonly region: Rectangle;

  /**
   * Output pixels per monitor pixel across (`width / region.width`): a point
   * at `x` in the picture is at `region.x + x / scale` on the monitor.
   */
  readonly scale: number;
}

/** What a `FrameSource` is asked for. */
export interface FrameRequest {
  /** The part of the monitor to show, or null for all of it. */
  readonly region: Rectangle | null;

  /** The size of the picture; the region is stretched to fill it. */
  readonly size: Size;
}

/** The part of a capture that touches Windows: one monitor, frames out of it. */
export interface FrameSource {
  /** The monitor's size in physical pixels now. */
  monitorSize(): Size;

  /**
   * The newest frame since the last call, cropped and scaled on the GPU and
   * read back; the ones in between are dropped.
   *
   * @param request - The region and the size.
   * @returns The frame; undefined when the monitor drew nothing new.
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
