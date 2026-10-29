import type { NodeAttachment } from "./control.ts";
import { control } from "./control.ts";
import type { FrameworkElement } from "#src/winui.js";

/**
 * One element's laid-out size, for a layout that adapts to it: what a
 * `ResizeObserver` is to the web. Put `size.attach` after `@attach` on the
 * element, and read `size.width` and `size.height` (device-independent
 * pixels) where the layout decides. Both are reactive, and 0 until the
 * element has been laid out and after it goes.
 */
export interface ElementSize {
  readonly width: number;
  readonly height: number;
  readonly attach: NodeAttachment;
}

/**
 * Makes a reactive reader of one element's `ActualWidth` and `ActualHeight`,
 * kept current by the element's `SizeChanged` event.
 *
 * @returns The reader: `attach` goes on the element, `width` and `height` are read where the size is needed.
 */
export function elementSize() {
  let width = $state(0);
  let height = $state(0);
  const attach = control<FrameworkElement>(element => {
    function measure() {
      width = element.actualWidth;
      height = element.actualHeight;
    }
    measure();
    const stop = element.onSizeChanged(measure);
    return () => {
      stop();
      width = 0;
      height = 0;
    };
  });
  return {
    get width() {
      return width;
    },
    get height() {
      return height;
    },
    attach
  };
}
