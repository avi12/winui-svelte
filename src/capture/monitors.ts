import { monitorHandleAt } from "./capture-item.ts";
import type { Rectangle } from "./region.ts";
import { DisplayArea } from "#winui/microsoft/ui/windowing/DisplayArea";

// Which monitor a caller means: the rectangle of one in physical pixels (what
// `DisplayArea.outerBounds` and `displays()` report), or a display id.

/** A monitor to capture: its rectangle in physical pixels of the virtual screen, or its display id. */
export type CaptureMonitor = Rectangle | { readonly displayId: bigint | string };

/** A monitor after its display id was checked. */
export type ResolvedMonitor = Rectangle | { readonly displayId: bigint };

const HALF = 2;

function centerOf(bounds: Rectangle) {
  return {
    x: bounds.x + Math.floor(bounds.width / HALF),
    y: bounds.y + Math.floor(bounds.height / HALF)
  };
}

function boundsOfDisplay(displayId: bigint) {
  const area = DisplayArea.getFromDisplayId({ value: displayId });
  return area.outerBounds;
}

/**
 * The `HMONITOR` of a monitor.
 *
 * @param monitor - The monitor, as a validated rectangle or a display id.
 * @returns The handle.
 * @throws {Error} when no monitor is there
 */
export function monitorHandleOf(monitor: ResolvedMonitor) {
  const isDisplayId = "displayId" in monitor;
  const bounds = isDisplayId ? boundsOfDisplay(monitor.displayId) : monitor;
  const handle = monitorHandleAt(centerOf(bounds));
  const isMissing = handle === undefined;
  if (isMissing) {
    throw new Error("there is no monitor there to capture");
  }

  return handle;
}
