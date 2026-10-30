import { colorFromCss } from "./css-color.ts";
import { parseFont } from "./font.ts";
import {
  CompositeOperation,
  ImageSmoothingQuality,
  LineCap,
  LineJoin,
  TextAlign,
  TextBaseline,
  TextDirection
} from "./names.ts";
import { CanvasGradient, CanvasPattern } from "./paint.ts";
import type { PaintStyle } from "./paint.ts";
import { solidStyleOf } from "./paint.ts";
import { IDENTITY } from "#src/win2d/matrix.js";
import type { Color, Matrix3x2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import type { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";

const DEFAULT_FONT = "10px sans-serif";
const DEFAULT_LINE_WIDTH = 1;
const DEFAULT_MITER_LIMIT = 10;
const BLACK_TEXT = "#000000";

/** Everything save() keeps and restore() brings back. */
export interface DrawingState {
  matrix: Matrix3x2;
  fillStyle: PaintStyle;
  strokeStyle: PaintStyle;
  lineWidth: number;
  lineCap: LineCap;
  lineJoin: LineJoin;
  miterLimit: number;
  lineDash: number[];
  lineDashOffset: number;
  globalAlpha: number;
  composite: CompositeOperation;
  font: string;
  textAlign: TextAlign;
  textBaseline: TextBaseline;
  direction: TextDirection;
  shadowColor: Color;
  shadowColorText: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  isSmoothing: boolean;
  smoothingQuality: ImageSmoothingQuality;

  /** The clip region, in device coordinates; undefined when there is none. */
  clip: CanvasGeometry | undefined;
}

function blackStyle() {
  const style = solidStyleOf(BLACK_TEXT);
  const isMissing = style === undefined;
  if (isMissing) {
    throw new Error("The default color is not a color");
  }

  return style;
}

/** The state of a new context. */
export function initialState() {
  return {
    matrix: IDENTITY,
    fillStyle: blackStyle(),
    strokeStyle: blackStyle(),
    lineWidth: DEFAULT_LINE_WIDTH,
    lineCap: LineCap.BUTT,
    lineJoin: LineJoin.MITER,
    miterLimit: DEFAULT_MITER_LIMIT,
    lineDash: [],
    lineDashOffset: 0,
    globalAlpha: 1,
    composite: CompositeOperation.SOURCE_OVER,
    font: DEFAULT_FONT,
    textAlign: TextAlign.START,
    textBaseline: TextBaseline.ALPHABETIC,
    direction: TextDirection.INHERIT,
    shadowColor: colorFromCss("transparent") ?? {
      a: 0,
      r: 0,
      g: 0,
      b: 0
    },
    shadowColorText: "rgba(0, 0, 0, 0)",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    isSmoothing: true,
    smoothingQuality: ImageSmoothingQuality.LOW,
    clip: undefined
  } satisfies DrawingState;
}

/** A copy that save() can push: changing it leaves the original as it was. */
export function copyState(state: DrawingState) {
  return {
    ...state,
    lineDash: [...state.lineDash]
  } satisfies DrawingState;
}

/** The style a `fillStyle` or `strokeStyle` assignment means, or undefined when it means none (and is ignored). */
export function styleOf(value: unknown) {
  const isText = typeof value === "string";
  if (isText) {
    return solidStyleOf(value);
  }

  const isPaint = value instanceof CanvasGradient || value instanceof CanvasPattern;
  return isPaint ? value : undefined;
}

/** Whether a string is a font the context accepts. */
export function isFont(text: string) {
  return parseFont(text) !== undefined;
}
