import { DomErrorName, domException } from "./dom-exception.ts";
import { ImageBitmap } from "./images.ts";
import type { ConstrainNumber, MediaTrackConstraints } from "./media-constraints.ts";
import { boundsOf } from "./media-constraints.ts";
import type { MediaStreamTrack } from "./media-devices.ts";
import type { CaptureFrame, FrameSource } from "#src/capture/frame.js";
import type { MonitorChoice } from "#src/capture/monitors.js";
import type { Rectangle } from "#src/capture/region.js";
import { fitWithin, wholeOf } from "#src/capture/region.js";
import { clampedFramesPerSecond, parseRegion } from "#src/capture/schema.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";

// The Screen Capture, Region Capture and Image Capture parts of the web that a
// display track needs: `track.cropTo(CropTarget)`, `new ImageCapture(track)`
// and the constraints `width`, `height` and `frameRate` of a display track,
// over the frames of `src/capture`. There is no `VideoFrame` in the library, so
// `MediaStreamTrackProcessor` is not defined: an app takes frames with
// `grabFrame()`, when it wants one.

const DEFAULT_FRAMES_PER_SECOND = 60;
const POLL_MILLISECONDS = 4;
const FIRST_FRAME_TIMEOUT_MILLISECONDS = 3000;
const BYTES_PER_PIXEL = 4;

/** What Windows adds to the video constraints of `getDisplayMedia`; a browser ignores every member. */
export interface DisplayConstraintExtras {
  /**
   * A monitor to capture without the picker: its rectangle in physical pixels
   * (what `DisplayArea.outerBounds` and `displays()` report) or its display id
   * (`DisplayArea.displayId.value`).
   */
  readonly monitor?: MonitorChoice;
}

/** The video constraints of `getDisplayMedia`: the standard ones, with the extras. */
export interface DisplayVideoConstraints extends MediaTrackConstraints, DisplayConstraintExtras {
  readonly displaySurface?: "monitor" | "window" | "browser";
  readonly cursor?: "always" | "motion" | "never";
}

function upperBoundOf(constraint: ConstrainNumber | undefined) {
  const bounds = boundsOf(constraint);
  return bounds.exact ?? bounds.max ?? bounds.ideal;
}

/**
 * The rate a display track's constraints ask for.
 *
 * @param constraints - The track constraints.
 * @returns The exact, maximum or ideal `frameRate`, from 1 to 240; 60 when none is given.
 */
export function framesPerSecondOf(constraints: MediaTrackConstraints) {
  return clampedFramesPerSecond(upperBoundOf(constraints.frameRate) ?? DEFAULT_FRAMES_PER_SECOND);
}

/**
 * Region Capture's `CropTarget`: what `track.cropTo` takes. The standard makes
 * one from an element (`CropTarget.fromElement`), which has no counterpart
 * here; `CropTarget.fromRect` is the extra, for a rectangle of the captured
 * monitor.
 */
export class CropTarget {
  /** The rectangle in the surface's own physical pixels, from its top left; WinUI-only. */
  readonly rectangle: Rectangle;

  private constructor(rectangle: Rectangle) {
    this.rectangle = rectangle;
  }

  /**
   * A target for a rectangle of the captured monitor, in its own physical
   * pixels from its top left. It is not clipped to the monitor: a part that
   * lies outside is black, and the frame keeps the rectangle's size. Extra.
   *
   * @param rectangle - `x`, `y`, `width` and `height`, whole pixels, width and height above 0.
   * @returns The target; `track.cropTo(target)` applies it.
   * @throws {TypeError} when it is not such a rectangle
   */
  static fromRect(rectangle: Rectangle) {
    return new CropTarget(parseRegion(rectangle));
  }

  get [Symbol.toStringTag]() {
    return "CropTarget";
  }
}

/** What `DisplayCapture` is made from. */
export interface DisplayCaptureInit {
  readonly source: FrameSource;
  readonly constraints: MediaTrackConstraints;
}

/**
 * What a display track does on top of its surface: the crop, the size and rate
 * limits, and a frame when one is asked for. It is the same object for a track
 * and its clones.
 */
export class DisplayCapture {
  private readonly source: FrameSource;
  private region: Rectangle | null = null;
  private widthLimit: number | undefined = undefined;
  private heightLimit: number | undefined = undefined;
  private frameRate = DEFAULT_FRAMES_PER_SECOND;

  /** Made by `getDisplayMedia`. */
  constructor({ source, constraints }: DisplayCaptureInit) {
    this.source = source;
    this.applyConstraints(constraints);
  }

  /** What the track is now: the size of its frames and the rate it was asked for. */
  get settings() {
    const size = this.outputSize();
    return {
      width: size.width,
      height: size.height,
      frameRate: this.frameRate
    };
  }

  /**
   * Shows only a rectangle of the surface, from the next frame on, or all of
   * it again for `null`.
   *
   * @param rectangle - The rectangle in the surface's physical pixels, or null.
   */
  cropTo(rectangle: Rectangle | null) {
    this.region = rectangle;
  }

  /**
   * Sets the largest a frame may be (`width` and `height`, an exact, maximum
   * or ideal; the picture shrinks to fit and keeps its proportions, never
   * enlarges) and the rate (`frameRate`, up to 240). A constraint left out is
   * no limit, as `applyConstraints` replaces the last ones.
   *
   * @param constraints - The track constraints.
   */
  applyConstraints(constraints: MediaTrackConstraints) {
    this.widthLimit = upperBoundOf(constraints.width);
    this.heightLimit = upperBoundOf(constraints.height);
    this.frameRate = framesPerSecondOf(constraints);
    this.source.setTargetFramesPerSecond(this.frameRate);
  }

  /**
   * The newest picture of the surface, cropped and shrunk on the GPU. It waits
   * for Windows' first frame; after that it answers at once, with the picture
   * as it last changed.
   *
   * @returns An `ImageBitmap` of the frame.
   * @throws {DOMException} `InvalidStateError` when Windows delivers no frame in time.
   */
  async grabFrame() {
    const deadline = performance.now() + FIRST_FRAME_TIMEOUT_MILLISECONDS;
    let frame: CaptureFrame | undefined = undefined;
    while (frame === undefined) {
      frame = this.source.readFrame({
        region: this.region,
        size: this.outputSize()
      });
      const isMissing = frame === undefined;
      const isLate = isMissing && performance.now() > deadline;
      if (isLate) {
        throw domException({
          name: DomErrorName.INVALID_STATE,
          message: "Windows delivered no frame of the screen"
        });
      }

      if (isMissing) {
        await new Promise<void>(resolve => {
          setTimeout(resolve, POLL_MILLISECONDS);
        });
      }
    }

    const length = frame.width * frame.height * BYTES_PER_PIXEL;
    const pixels = new Uint8ClampedArray(frame.pixels.buffer, frame.pixels.byteOffset, length);
    return new ImageBitmap(new ImageData(pixels, frame.width));
  }

  private outputSize() {
    return fitWithin({
      size: this.region ?? wholeOf(this.source.surfaceSize()),
      limits: {
        width: this.widthLimit,
        height: this.heightLimit
      }
    });
  }
}

/**
 * The standard `ImageCapture`, for a display track: `grabFrame()` gives the
 * track's picture now, as an `ImageBitmap`. `takePhoto`, `getPhotoCapabilities`
 * and `getPhotoSettings` are not here.
 */
export class ImageCapture {
  readonly track: MediaStreamTrack;

  /**
   * Makes the capture of a track.
   *
   * @param track - A live video track.
   * @throws {TypeError} when it is not a video track
   */
  constructor(track: MediaStreamTrack) {
    const isVideo = track.kind === "video";
    if (!isVideo) {
      throw new TypeError("ImageCapture takes a video track");
    }

    this.track = track;
  }

  /**
   * One frame of the track.
   *
   * @returns An `ImageBitmap`; close it when done.
   * @throws {DOMException} `InvalidStateError` for a track that has ended;
   *     `NotSupportedError` for a track that is not a screen (a camera's
   *     frames are not delivered)
   */
  grabFrame() {
    const isEnded = this.track.readyState !== "live";
    if (isEnded) {
      return Promise.reject(
        domException({
          name: DomErrorName.INVALID_STATE,
          message: "The track has ended"
        })
      );
    }

    const frame = this.track.displayCapture?.grabFrame();
    const isScreen = frame !== undefined;
    if (!isScreen) {
      return Promise.reject(
        domException({
          name: DomErrorName.NOT_SUPPORTED,
          message: "Only the frames of a screen track are delivered"
        })
      );
    }

    return frame;
  }

  get [Symbol.toStringTag]() {
    return "ImageCapture";
  }
}
