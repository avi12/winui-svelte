import { toCssPixels, toDevicePixels } from "#src/window/css-pixels.js";
import type { AppWindow } from "#src/winui.js";

/**
 * One window's size and place as the web's `window` has them (`outerWidth`,
 * `outerHeight`, `screenX`, `screenY`, `devicePixelRatio`, `resizeTo`,
 * `resizeBy`, `moveTo`, `moveBy`), in CSS pixels, over its `AppWindow`. A
 * process holds many windows, so there is no `window` global for it; a
 * `WindowHandle` gives each window its own (`handle.geometry`).
 *
 * CSS pixels are WinUI's device-independent pixels, at the window's scale.
 */
export class WindowGeometry {
  private readonly appWindow: AppWindow;
  private readonly readScale: () => number;

  /** Made by `WindowHandle`. */
  constructor(appWindow: AppWindow, readScale: () => number) {
    this.appWindow = appWindow;
    this.readScale = readScale;
  }

  /** Device pixels per CSS pixel. */
  // fallow-ignore-next-line unused-class-member
  get devicePixelRatio() {
    return this.readScale();
  }

  /** The window's width with its frame, in CSS pixels. */
  get outerWidth() {
    return toCssPixels({
      value: this.appWindow.size.width,
      scale: this.readScale()
    });
  }

  /** The window's height with its frame, in CSS pixels. */
  get outerHeight() {
    return toCssPixels({
      value: this.appWindow.size.height,
      scale: this.readScale()
    });
  }

  /** The window's left edge on the desktop, in CSS pixels at this window's scale. */
  get screenX() {
    return toCssPixels({
      value: this.appWindow.position.x,
      scale: this.readScale()
    });
  }

  /** The window's top edge on the desktop, in CSS pixels at this window's scale. */
  get screenY() {
    return toCssPixels({
      value: this.appWindow.position.y,
      scale: this.readScale()
    });
  }

  /**
   * Resizes the window (frame included) to `width` by `height` CSS pixels,
   * keeping its top-left corner: `AppWindow.Resize`. A side that
   * `sizeToContent` sets is set again by the content.
   */
  resizeTo(width: number, height: number) {
    const scale = this.readScale();
    this.appWindow.resize({
      width: toDevicePixels({
        value: width,
        scale
      }),
      height: toDevicePixels({
        value: height,
        scale
      })
    });
  }

  /** Grows (or shrinks) the window by `width` and `height` CSS pixels. */
  // fallow-ignore-next-line unused-class-member
  resizeBy(width: number, height: number) {
    this.resizeTo(this.outerWidth + width, this.outerHeight + height);
  }

  /** Puts the window's top-left corner at `x`, `y` CSS pixels on the desktop: `AppWindow.Move`. */
  moveTo(x: number, y: number) {
    const scale = this.readScale();
    this.appWindow.move({
      x: toDevicePixels({
        value: x,
        scale
      }),
      y: toDevicePixels({
        value: y,
        scale
      })
    });
  }

  /** Moves the window by `x` and `y` CSS pixels. */
  // fallow-ignore-next-line unused-class-member
  moveBy(x: number, y: number) {
    this.moveTo(this.screenX + x, this.screenY + y);
  }
}
