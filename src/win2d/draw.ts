import { callOverload } from "./overloads.ts";
import type { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import type { Color, Matrix3x2, Rect, Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CanvasDrawingSession } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { ICanvasImage } from "#winui/microsoft/graphics/canvas/ICanvasImage";
import type { ICanvasBrush } from "#winui/microsoft/graphics/canvas/brushes/ICanvasBrush";
import type { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";
import type { CanvasTextFormat } from "#winui/microsoft/graphics/canvas/text/CanvasTextFormat";

// Drawing on a CanvasDrawingSession with options objects. A paint is a Color
// (channels 0 to 255) or any Win2D brush.

/** A color or a brush: what a shape is filled or stroked with. */
export type Paint = Color | ICanvasBrush;

/** What drawText takes besides the session. */
export interface TextOptions {
  text: string;
  x: number;
  y: number;
  paint: Paint;
  format: CanvasTextFormat;

  /** With `height`: wrap and clip the text to a box this wide. */
  width?: number;

  /** With `width`: wrap and clip the text to a box this high. */
  height?: number;
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const COLOR_CHANNELS = ["a", "r", "g", "b"];
const MAX_CHANNEL = 255;

/** Whether a paint is a Color rather than a brush. */
export function isColor(paint: Paint) {
  return COLOR_CHANNELS.every(channel => typeof Reflect.get(paint, channel) === "number");
}

function paintName(paint: Paint) {
  return isColor(paint) ? "color" : "brush";
}

function withStroke({ names, strokeWidth }: {
  names: string[];
  strokeWidth: number | undefined;
}) {
  const isStroked = strokeWidth !== undefined;
  return isStroked ? [...names, "strokeWidth"] : names;
}

function withValue({ values, strokeWidth }: {
  values: unknown[];
  strokeWidth: number | undefined;
}) {
  const isStroked = strokeWidth !== undefined;
  return isStroked ? [...values, strokeWidth] : values;
}

/** Clears the whole surface with a color. */
export function clear({ session, color }: {
  session: CanvasDrawingSession;
  color: Color;
}) {
  session.clear({
    x: color.r / MAX_CHANNEL,
    y: color.g / MAX_CHANNEL,
    z: color.b / MAX_CHANNEL,
    w: color.a / MAX_CHANNEL
  });
}

/** Fills a rectangle. */
export function fillRectangle({ session, x, y, width, height, paint }: Box & {
  session: CanvasDrawingSession;
  paint: Paint;
}) {
  callOverload({
    target: session,
    method: "fillRectangle",
    parameters: ["x", "y", "w", "h", paintName(paint)],
    args: [x, y, width, height, paint]
  });
}

/** Strokes the outline of a rectangle. */
export function drawRectangle({ session, x, y, width, height, paint, strokeWidth }: Box & {
  session: CanvasDrawingSession;
  paint: Paint;
  strokeWidth?: number;
}) {
  callOverload({
    target: session,
    method: "drawRectangle",
    parameters: withStroke({
      names: ["x", "y", "w", "h", paintName(paint)],
      strokeWidth
    }),
    args: withValue({
      values: [x, y, width, height, paint],
      strokeWidth
    })
  });
}

/** Fills a rectangle with rounded corners. */
export function fillRoundedRectangle({ session, x, y, width, height, radiusX, radiusY, paint }: Box & {
  session: CanvasDrawingSession;
  radiusX: number;
  radiusY: number;
  paint: Paint;
}) {
  callOverload({
    target: session,
    method: "fillRoundedRectangle",
    parameters: ["x", "y", "w", "h", "radiusX", "radiusY", paintName(paint)],
    args: [x, y, width, height, radiusX, radiusY, paint]
  });
}

/** Fills an ellipse around its center. */
export function fillEllipse({ session, x, y, radiusX, radiusY, paint }: {
  session: CanvasDrawingSession;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  paint: Paint;
}) {
  callOverload({
    target: session,
    method: "fillEllipse",
    parameters: ["x", "y", "radiusX", "radiusY", paintName(paint)],
    args: [x, y, radiusX, radiusY, paint]
  });
}

/** Strokes the outline of an ellipse around its center. */
export function drawEllipse({ session, x, y, radiusX, radiusY, paint, strokeWidth }: {
  session: CanvasDrawingSession;
  x: number;
  y: number;
  radiusX: number;
  radiusY: number;
  paint: Paint;
  strokeWidth?: number;
}) {
  callOverload({
    target: session,
    method: "drawEllipse",
    parameters: withStroke({
      names: ["x", "y", "radiusX", "radiusY", paintName(paint)],
      strokeWidth
    }),
    args: withValue({
      values: [x, y, radiusX, radiusY, paint],
      strokeWidth
    })
  });
}

/** Fills a circle around its center. */
export function fillCircle({ session, x, y, radius, paint }: {
  session: CanvasDrawingSession;
  x: number;
  y: number;
  radius: number;
  paint: Paint;
}) {
  callOverload({
    target: session,
    method: "fillCircle",
    parameters: ["x", "y", "radius", paintName(paint)],
    args: [x, y, radius, paint]
  });
}

/** Strokes the outline of a circle around its center. */
export function drawCircle({ session, x, y, radius, paint, strokeWidth }: {
  session: CanvasDrawingSession;
  x: number;
  y: number;
  radius: number;
  paint: Paint;
  strokeWidth?: number;
}) {
  callOverload({
    target: session,
    method: "drawCircle",
    parameters: withStroke({
      names: ["x", "y", "radius", paintName(paint)],
      strokeWidth
    }),
    args: withValue({
      values: [x, y, radius, paint],
      strokeWidth
    })
  });
}

/** Draws a line between two points. */
export function drawLine({ session, from, to, paint, strokeWidth }: {
  session: CanvasDrawingSession;
  from: Vector2;
  to: Vector2;
  paint: Paint;
  strokeWidth?: number;
}) {
  callOverload({
    target: session,
    method: "drawLine",
    parameters: withStroke({
      names: ["x0", "y0", "x1", "y1", paintName(paint)],
      strokeWidth
    }),
    args: withValue({
      values: [from.x, from.y, to.x, to.y, paint],
      strokeWidth
    })
  });
}

/** Draws a text, in a box when a width and a height are given. */
export function drawText({ session, text, x, y, paint, format, width, height }: TextOptions & {
  session: CanvasDrawingSession;
}) {
  const isBoxed = width !== undefined && height !== undefined;
  const name = paintName(paint);
  callOverload({
    target: session,
    method: "drawText",
    parameters: isBoxed ? ["text", "x", "y", "w", "h", name, "format"] : ["text", "x", "y", name, "format"],
    args: isBoxed ? [text, x, y, width, height, paint, format] : [text, x, y, paint, format]
  });
}

/** Fills a geometry, moved by an offset. */
export function fillGeometry({ session, geometry, paint, x = 0, y = 0 }: {
  session: CanvasDrawingSession;
  geometry: CanvasGeometry;
  paint: Paint;
  x?: number;
  y?: number;
}) {
  callOverload({
    target: session,
    method: "fillGeometry",
    parameters: ["geometry", "x", "y", paintName(paint)],
    args: [geometry, x, y, paint]
  });
}

/** Strokes the outline of a geometry, moved by an offset. */
export function drawGeometry({ session, geometry, paint, strokeWidth, x = 0, y = 0 }: {
  session: CanvasDrawingSession;
  geometry: CanvasGeometry;
  paint: Paint;
  strokeWidth: number;
  x?: number;
  y?: number;
}) {
  callOverload({
    target: session,
    method: "drawGeometry",
    parameters: ["geometry", "x", "y", paintName(paint), "strokeWidth"],
    args: [geometry, x, y, paint, strokeWidth]
  });
}

/** Draws an image (a bitmap, an effect or a command list) with its corner at a point. */
export function drawImage({ session, image, x = 0, y = 0 }: {
  session: CanvasDrawingSession;
  image: ICanvasImage;
  x?: number;
  y?: number;
}) {
  callOverload({
    target: session,
    method: "drawImage",
    parameters: ["image", "x", "y"],
    args: [image, x, y]
  });
}

/** Draws a bitmap stretched to a rectangle. */
export function drawBitmap({ session, bitmap, destination }: {
  session: CanvasDrawingSession;
  bitmap: CanvasBitmap;
  destination: Rect;
}) {
  callOverload({
    target: session,
    method: "drawImage",
    parameters: ["bitmap", "destinationRectangle"],
    args: [bitmap, destination]
  });
}

/** Sets the transform the following drawing goes through; returns the one it replaced. */
export function setTransform({ session, matrix }: {
  session: CanvasDrawingSession;
  matrix: Matrix3x2;
}) {
  const previous = session.transform;
  session.transform = matrix;
  return previous;
}
