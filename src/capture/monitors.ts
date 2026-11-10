import { captureItemOfMonitor, monitorHandleAt } from "./capture-item.ts";
import type { Rectangle } from "./region.ts";
import { DisplayArea } from "#winui/microsoft/ui/windowing/DisplayArea";

// Which monitor a caller means without the picker: the rectangle of one in
// physical pixels (what `DisplayArea.outerBounds` and `displays()` report), or
// a display id (`DisplayArea.displayId.value`).

/** A monitor to capture: its rectangle in physical pixels of the virtual screen, or its display id. */
export type MonitorChoice = Rectangle | { readonly displayId: bigint | string };

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
 * The capture item of a monitor, made with the interop call that works in a
 * packaged app.
 *
 * @param monitor - The monitor, as a validated rectangle or a display id.
 * @returns The item.
 * @throws {Error} when no monitor is there
 */
export function monitorItemOf(monitor: ResolvedMonitor) {
  const isDisplayId = "displayId" in monitor;
  const bounds = isDisplayId ? boundsOfDisplay(monitor.displayId) : monitor;
  const handle = monitorHandleAt(centerOf(bounds));
  const isMissing = handle === undefined;
  if (isMissing) {
    throw new Error("there is no monitor there to capture");
  }

  return captureItemOfMonitor(handle);
}
