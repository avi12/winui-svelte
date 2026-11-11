import type { Rectangle } from "#src/capture/region.js";
import type { MediaStreamTrack } from "#src/web-apis/media-devices.js";
import { CropTarget, ImageCapture } from "#src/web-apis/screen-capture.js";

/** What `CroppedView` is made from. */
export interface CroppedViewOptions {
  /** A live track of a screen, from `getDisplayMedia`. */
  readonly track: MediaStreamTrack;
}

/**
 * Shows only a rectangle of a captured monitor, and lets it be moved, resized
 * and dropped again. It is `track.cropTo(CropTarget.fromRect(...))` and
 * `new ImageCapture(track).grabFrame()` with the rectangle remembered, so a
 * selection overlay can hand over each edit. Every rectangle is in the
 * monitor's own physical pixels from its top left (`pixelRegion` converts a
 * selection drawn in device-independent pixels).
 */
export class CroppedView {
  private readonly track: MediaStreamTrack;
  private readonly capture: ImageCapture;
  private current: Rectangle | null = null;

  /**
   * Makes the view of a track.
   *
   * @param options - The screen track to crop.
   * @throws {TypeError} when the track is not a video track
   */
  constructor({ track }: CroppedViewOptions) {
    this.track = track;
    this.capture = new ImageCapture(track);
  }

  /** The rectangle shown now, or null while the whole monitor is. */
  get region() {
    return this.current;
  }

  /**
   * Shows only this rectangle, from the next frame on.
   *
   * @param region - `x`, `y`, `width` and `height` in whole pixels, width and height above 0.
   * @returns Resolves when the track has taken the crop.
   * @throws {TypeError} when the rectangle is not valid
   * @throws {DOMException} when the track has ended or is not a screen
   */
  async show(region: Rectangle) {
    const target = CropTarget.fromRect(region);
    await this.track.cropTo(target);
    this.current = target.rectangle;
  }

  /**
   * Moves the shown rectangle, keeping its size. It may reach past the
   * monitor; the part outside is black.
   *
   * @param position - The new top left.
   * @returns Resolves when the track has taken the crop.
   * @throws {Error} when no rectangle is shown
   */
  async moveTo(position: Pick<Rectangle, "x" | "y">) {
    return this.show({
      ...this.shown(),
      x: position.x,
      y: position.y
    });
  }

  /**
   * Resizes the shown rectangle, keeping its top left.
   *
   * @param size - The new width and height.
   * @returns Resolves when the track has taken the crop.
   * @throws {Error} when no rectangle is shown
   */
  async resizeTo(size: Pick<Rectangle, "width" | "height">) {
    return this.show({
      ...this.shown(),
      width: size.width,
      height: size.height
    });
  }

  /**
   * Shows the whole monitor again (`track.cropTo(null)`).
   *
   * @returns Resolves when the track has taken it.
   */
  async reset() {
    await this.track.cropTo(null);
    this.current = null;
  }

  /**
   * The frame as it is now: the rectangle alone while one is shown, otherwise
   * the whole monitor. Draw it into a preview, then close it.
   *
   * @returns An `ImageBitmap` of the frame.
   * @throws {DOMException} `InvalidStateError` when the track ended or Windows delivered no frame
   */
  grabFrame() {
    return this.capture.grabFrame();
  }

  private shown() {
    const { current } = this;
    const isHidden = current === null;
    if (isHidden) {
      throw new Error("No rectangle is shown: call show() first");
    }

    return current;
  }
}
