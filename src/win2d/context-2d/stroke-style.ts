import { LineCap, LineJoin } from "./names.ts";
import { CanvasCapStyle } from "#winui/microsoft/graphics/canvas/geometry/CanvasCapStyle";
import { CanvasLineJoin } from "#winui/microsoft/graphics/canvas/geometry/CanvasLineJoin";
import { CanvasStrokeStyle } from "#winui/microsoft/graphics/canvas/geometry/CanvasStrokeStyle";

const CAPS = new Map<LineCap, CanvasCapStyle>([
  [LineCap.BUTT, CanvasCapStyle.Flat],
  [LineCap.ROUND, CanvasCapStyle.Round],
  [LineCap.SQUARE, CanvasCapStyle.Square]
]);
// A miter that passes the limit becomes a bevel, as the canvas draws it.
const JOINS = new Map<LineJoin, CanvasLineJoin>([
  [LineJoin.MITER, CanvasLineJoin.MiterOrBevel],
  [LineJoin.ROUND, CanvasLineJoin.Round],
  [LineJoin.BEVEL, CanvasLineJoin.Bevel]
]);

/** The line settings of a context that a stroke is drawn with. */
export interface StrokeSettings {
  lineWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  miterLimit: number;
  lineDash: number[];
  lineDashOffset: number;
}

/**
 * A Win2D stroke style with the context's caps, joins and dashes. Win2D counts
 * dashes (and their offset) in line widths, the canvas in pixels.
 */
export function createStrokeStyle(settings: StrokeSettings) {
  const style = new CanvasStrokeStyle();
  const cap = CAPS.get(settings.lineCap) ?? CanvasCapStyle.Flat;
  style.startCap = cap;
  style.endCap = cap;
  style.dashCap = cap;
  style.lineJoin = JOINS.get(settings.lineJoin) ?? CanvasLineJoin.MiterOrBevel;
  style.miterLimit = settings.miterLimit;
  const hasDashes = settings.lineDash.length > 0;
  if (hasDashes) {
    style.customDashStyle = settings.lineDash.map(length => length / settings.lineWidth);
    style.dashOffset = settings.lineDashOffset / settings.lineWidth;
  }

  return style;
}
