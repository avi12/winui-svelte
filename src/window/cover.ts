import type { WindowBounds } from "./anchor.ts";
import { coveredBounds } from "./anchor.ts";
import type { DockDisplay } from "./dock.ts";
import { displayAreaOf } from "./dock.ts";
import type { AppWindow } from "#src/winui.js";
import { DisplayArea, DisplayAreaFallback } from "#src/winui.js";

const MAX_RESCALE_RETRIES = 2;

/** Where `coverWindow` puts a window. */
export interface CoverOptions {
  /**
   * The display to cover: a `DockDisplay` name, or the `id` that `displays()`
   * lists for it; the active display by default.
   */
  display?: DockDisplay | bigint;

  /**
   * A rectangle in the display's own physical pixels, relative to its top
   * left; the whole display by default. It is not clipped to the display, so a
   * frame drawn a few pixels outside a region at the display's edge stays
   * where it was asked for. The pixels are those of the display it is
   * placed on: a region measured on another display has to be mapped first.
   */
  region?: WindowBounds;
}

function areaOf({ appWindow, display }: {
  appWindow: AppWindow;
  display: DockDisplay | bigint;
}) {
  const isDisplayId = typeof display === "bigint";
  if (isDisplayId) {
    return DisplayArea.getFromDisplayId({ value: display });
  }

  return displayAreaOf({
    appWindow,
    display
  });
}

function isAt({ appWindow, bounds }: {
  appWindow: AppWindow;
  bounds: WindowBounds;
}) {
  const { position, size } = appWindow;
  const isPlaced = position.x === bounds.x && position.y === bounds.y;
  return isPlaced && size.width === bounds.width && size.height === bounds.height;
}

/**
 * Puts a window over a whole display, or over a rectangle of one, in physical
 * pixels. A covering window needs `isBorderless` and `isResizable={false}`:
 * without the second, the 8 pixel resize frame stays and shrinks the client
 * area. `cover` leaves the frame as the props set it.
 *
 * A window sent to a display with another scale first goes to that display's
 * origin, so Windows rescales it there, and is then placed once at the bounds
 * asked for in that display's pixels; a rescale that still changed the size
 * afterward is placed again, at most twice.
 *
 * @param options - The window, the display (the active one by default) and
 * the region (the whole display by default).
 * @returns The bounds applied, in physical pixels, for a caller that keeps a frame or a canvas in step.
 */
export function coverWindow({ appWindow, display = "active", region }: CoverOptions & {
  appWindow: AppWindow;
}) {
  const area = areaOf({
    appWindow,
    display
  });
  const { outerBounds } = area;
  const bounds = coveredBounds({
    area: outerBounds,
    region
  });
  const currentArea = DisplayArea.getFromWindowId(appWindow.id, DisplayAreaFallback.Nearest);
  const isOnOtherDisplay = currentArea.displayId.value !== area.displayId.value;
  if (isOnOtherDisplay) {
    appWindow.move({
      x: outerBounds.x,
      y: outerBounds.y
    });
  }

  for (let iTry = 0; iTry <= MAX_RESCALE_RETRIES; iTry++) {
    appWindow.moveAndResize(bounds);

    if (isAt({
      appWindow,
      bounds
    })) {
      break;
    }
  }

  return bounds;
}
