import type { OwnedBrush } from "./paint.ts";
import { isColor } from "#src/win2d/draw.js";
import type { Paint } from "#src/win2d/draw.js";
import type { Color } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CanvasDrawingSession } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";
import type { CanvasStrokeStyle } from "#winui/microsoft/graphics/canvas/geometry/CanvasStrokeStyle";
import type { CanvasTextLayout } from "#winui/microsoft/graphics/canvas/text/CanvasTextLayout";

// The drawing session's calls that take either a color or a brush: the
// bindings name each combination, so the paint picks the call.

/** Fills a geometry at the origin. */
export function fillWith({ session, geometry, paint }: {
  session: CanvasDrawingSession;
  geometry: CanvasGeometry;
  paint: Paint;
}) {
  if (isColor(paint)) {
    session.fillGeometryAtOriginWithColor(geometry, paint);
    return;
  }

  session.fillGeometryAtOriginWithBrush(geometry, paint);
}

/** Strokes a geometry, offset by a point. */
export function strokeWith({ session, geometry, paint, width, style, x = 0, y = 0 }: {
  session: CanvasDrawingSession;
  geometry: CanvasGeometry;
  paint: Paint;
  width: number;
  style: CanvasStrokeStyle;
  x?: number;
  y?: number;
}) {
  if (isColor(paint)) {
    session.drawGeometryAtCoordsWithColorAndStrokeWidthAndStrokeStyle(geometry, x, y, paint, width, style);
    return;
  }

  session.drawGeometryAtCoordsWithBrushAndStrokeWidthAndStrokeStyle(geometry, x, y, paint, width, style);
}

/** Fills a rectangle. */
export function fillBox({ session, x, y, width, height, paint }: {
  session: CanvasDrawingSession;
  x: number;
  y: number;
  width: number;
  height: number;
  paint: Paint;
}) {
  if (isColor(paint)) {
    session.fillRectangleAtCoordsWithColor(x, y, width, height, paint);
    return;
  }

  session.fillRectangleAtCoordsWithBrush(x, y, width, height, paint);
}

/** Draws a laid-out text with its top left corner at a point. */
export function drawLayout({ session, layout, x, y, paint }: {
  session: CanvasDrawingSession;
  layout: CanvasTextLayout;
  x: number;
  y: number;
  paint: Paint;
}) {
  if (isColor(paint)) {
    session.drawTextLayoutAtCoordsWithColor(layout, x, y, paint);
    return;
  }

  session.drawTextLayoutAtCoordsWithBrush(layout, x, y, paint);
}

/** Lets go of a brush the drawing is done with (a color has nothing to let go). */
export function release(paint: Color | OwnedBrush) {
  const isBrush = "close" in paint;
  if (isBrush) {
    paint.close();
  }
}
