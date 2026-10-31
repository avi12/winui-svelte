import type { NodeAttachment } from "./control.ts";
import { control } from "./control.ts";
import type { FrameworkElement } from "#src/winui.js";

/**
 * One element's laid-out size, for a layout that adapts to it: what a
 * `ResizeObserver` is to the web. Put `size.attach` after `@attach` on the
 * element, and read `size.width` and `size.height` (device-independent
 * pixels) where the layout decides. All are reactive, and 0 until the
 * element has been laid out and after it goes.
 *
 * `width` and `height` are what the element was given: an element that
 * stretches (a panel at the root of a window, by default) is as large as the
 * space it is in, not as large as its content. `desiredWidth` and
 * `desiredHeight` are what its content asks for, so a window sized from its
 * content reads those (or sets `align-self: start` on the element, which makes
 * the two the same).
 */
export interface ElementSize {
  readonly width: number;
  readonly height: number;
  readonly desiredWidth: number;
  readonly desiredHeight: number;
  readonly attach: NodeAttachment;
}

/**
 * Makes a reactive reader of one element's `ActualWidth` and `ActualHeight`,
 * and of the size its content asks for (`DesiredSize`), kept current by the
 * element's `SizeChanged` and `LayoutUpdated` events.
 *
 * @returns The reader: `attach` goes on the element; the four sizes are read where the layout decides.
 */
export function elementSize() {
  let width = $state(0);
  let height = $state(0);
  let desiredWidth = $state(0);
  let desiredHeight = $state(0);
  const attach = control<FrameworkElement>(element => {
    function measure() {
      width = element.actualWidth;
      height = element.actualHeight;
      desiredWidth = element.desiredSize.width;
      desiredHeight = element.desiredSize.height;
    }
    measure();
    // A stretched element keeps its size while its content grows, so only a
    // layout pass tells the desired size changed.
    const stopSize = element.onSizeChanged(measure);
    const stopLayout = element.onLayoutUpdated(measure);
    return () => {
      stopSize();
      stopLayout();
      width = 0;
      height = 0;
      desiredWidth = 0;
      desiredHeight = 0;
    };
  });
  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    get desiredWidth() {
      return desiredWidth;
    },
    get desiredHeight() {
      return desiredHeight;
    },
    attach
  };
}
