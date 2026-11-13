import type { CanvasElement } from "./canvas-element.ts";
import { colorFromCss, cssFromColor, withOpacity } from "./css-color.ts";
import { parseFont } from "./font.ts";
import { buildGeometry } from "./geometry.ts";
import { readImageData, writeImageData } from "./image-data.ts";
import { ImageData } from "./image-data.ts";
import type { Rectangle } from "./image-plan.ts";
import { planImage } from "./image-plan.ts";
import {
  CompositeOperation,
  FillRule,
  fillRuleOf,
  ImageSmoothingQuality,
  LineCap,
  LineJoin,
  memberOf,
  TextAlign,
  TextBaseline,
  TextDirection
} from "./names.ts";
import {
  drawLayout,
  fillBox,
  fillWith,
  release,
  strokeWith
} from "./paint-calls.ts";
import { CanvasGradient, CanvasPattern, repetitionOf } from "./paint.ts";
import type { PaintStyle } from "./paint.ts";
import type { MatrixInit } from "./path.ts";
import { DevicePath, matrixFromInit, Path2D } from "./path.ts";
import { copyState, initialState, isFont, styleOf } from "./state.ts";
import type { DrawingState } from "./state.ts";
import { createStrokeStyle } from "./stroke-style.ts";
import type { Surface } from "./surface.ts";
import { placeText } from "./text-layout.ts";
import {
  applyToPoint,
  invert,
  isFiniteMatrix,
  isIdentityMatrix,
  isInvertible
} from "./transform-math.ts";
import type { Paint } from "#src/win2d/draw.js";
import {
  IDENTITY,
  multiply,
  rotation,
  scaling,
  translation
} from "#src/win2d/matrix.js";
import { createRenderTarget } from "#src/win2d/resources.js";
import { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import { CanvasCommandList } from "#winui/microsoft/graphics/canvas/CanvasCommandList";
import { CanvasComposite } from "#winui/microsoft/graphics/canvas/CanvasComposite";
import type { CanvasDrawingSession, Matrix3x2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import { CanvasImageInterpolation } from "#winui/microsoft/graphics/canvas/CanvasImageInterpolation";
import { ShadowEffect } from "#winui/microsoft/graphics/canvas/effects/ShadowEffect";
import { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";
import { CanvasGeometryCombine } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometryCombine";
import type { ICanvasImage } from "#winui/microsoft/graphics/canvas/ICanvasImage";

const COMPOSITES = new Map<CompositeOperation, CanvasComposite>([
  [CompositeOperation.SOURCE_OVER, CanvasComposite.SourceOver],
  [CompositeOperation.SOURCE_IN, CanvasComposite.SourceIn],
  [CompositeOperation.SOURCE_OUT, CanvasComposite.SourceOut],
  [CompositeOperation.SOURCE_ATOP, CanvasComposite.SourceAtop],
  [CompositeOperation.DESTINATION_OVER, CanvasComposite.DestinationOver],
  [CompositeOperation.DESTINATION_IN, CanvasComposite.DestinationIn],
  [CompositeOperation.DESTINATION_OUT, CanvasComposite.DestinationOut],
  [CompositeOperation.DESTINATION_ATOP, CanvasComposite.DestinationAtop],
  [CompositeOperation.LIGHTER, CanvasComposite.Add],
  [CompositeOperation.COPY, CanvasComposite.Copy],
  [CompositeOperation.XOR, CanvasComposite.Xor]
]);
const SMOOTHING = new Map<ImageSmoothingQuality, CanvasImageInterpolation>([
  [ImageSmoothingQuality.LOW, CanvasImageInterpolation.Linear],
  [ImageSmoothingQuality.MEDIUM, CanvasImageInterpolation.Cubic],
  [ImageSmoothingQuality.HIGH, CanvasImageInterpolation.HighQualityCubic]
]);
const SHADOW_BLUR_TO_DEVIATION = 2;
const OPAQUE_BLACK = {
  a: 255,
  r: 0,
  g: 0,
  b: 0
};

/** What drawImage and createPattern take: a bitmap, or a canvas (anything with a `target` bitmap). */
export type ImageSource = CanvasBitmap | { readonly target: CanvasBitmap };

/** The matrix getTransform returns: a DOMMatrix's members for a 2D transform. */
export interface TransformMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  m11: number;
  m12: number;
  m21: number;
  m22: number;
  m41: number;
  m42: number;
  is2D: true;
  isIdentity: boolean;
}

/** What measureText returns, from the layout Win2D makes: widths and bounds in pixels. */
export interface TextMetrics {
  width: number;
  actualBoundingBoxLeft: number;
  actualBoundingBoxRight: number;
  actualBoundingBoxAscent: number;
  actualBoundingBoxDescent: number;
  fontBoundingBoxAscent: number;
  fontBoundingBoxDescent: number;
  emHeightAscent: number;
  emHeightDescent: number;
}

function bitmapOf(source: ImageSource) {
  return source instanceof CanvasBitmap ? source : source.target;
}

function isFiniteList(values: number[]) {
  return values.every(Number.isFinite);
}

/**
 * The drawing context of a canvas: the HTML Canvas 2D API, drawing with Win2D.
 * Get it from `canvas.getContext("2d")`. The documentation lists what is and is
 * not supported.
 *
 * Its methods are positional like the platform's, so a library written for a
 * browser canvas calls them unchanged.
 */
export class Context2D {
  /** The canvas this context draws on. */
  readonly canvas: CanvasElement;
  private readonly surface: Surface;
  private state: DrawingState = initialState();
  private readonly saved: DrawingState[] = [];
  private path = new DevicePath();

  constructor({ canvas, surface }: {
    canvas: CanvasElement;
    surface: Surface;
  }) {
    this.canvas = canvas;
    this.surface = surface;
  }

  /** Puts every setting back as in a new context (the canvas calls it when it is resized). */
  resetState() {
    this.state = initialState();
    this.saved.length = 0;
    this.path = new DevicePath();
  }

  /** Clears the canvas and puts every setting back. */
  reset() {
    const { width, height } = this.surface.target.sizeInPixels;
    this.surface.reset({
      width,
      height
    });
    this.resetState();
  }

  /** Whether the context was lost: it never is, the canvas lives as long as its device. */
  isContextLost() {
    return false;
  }

  /** The settings the context was made with. */
  getContextAttributes() {
    return {
      alpha: true,
      colorSpace: "srgb",
      desynchronized: false,
      willReadFrequently: false
    };
  }

  // State

  /** Pushes the drawing state (settings, transform and clip) on a stack. */
  save() {
    this.saved.push(copyState(this.state));
  }

  /** Pops the drawing state pushed last; does nothing when the stack is empty. */
  restore() {
    const previous = this.saved.pop();
    const hasPrevious = previous !== undefined;
    if (hasPrevious) {
      this.state = previous;
    }
  }

  /** The color, gradient or pattern shapes are filled with. */
  get fillStyle() {
    const style = this.state.fillStyle;
    return "text" in style ? style.text : style;
  }

  set fillStyle(value: string | CanvasGradient | CanvasPattern) {
    this.state.fillStyle = styleOf(value) ?? this.state.fillStyle;
  }

  /** The color, gradient or pattern outlines are drawn with. */
  get strokeStyle() {
    const style = this.state.strokeStyle;
    return "text" in style ? style.text : style;
  }

  set strokeStyle(value: string | CanvasGradient | CanvasPattern) {
    this.state.strokeStyle = styleOf(value) ?? this.state.strokeStyle;
  }

  /** The width of lines, in pixels; a value that is not positive is ignored. */
  get lineWidth() {
    return this.state.lineWidth;
  }

  set lineWidth(value: number) {
    const isValid = Number.isFinite(value) && value > 0;
    if (isValid) {
      this.state.lineWidth = value;
    }
  }

  /** The end of lines: `butt`, `round` or `square`. */
  get lineCap() {
    return this.state.lineCap;
  }

  set lineCap(value: LineCap) {
    this.state.lineCap = memberOf({
      set: LineCap,
      value
    }) ?? this.state.lineCap;
  }

  /** The corners of lines: `miter`, `round` or `bevel`. */
  get lineJoin() {
    return this.state.lineJoin;
  }

  set lineJoin(value: LineJoin) {
    this.state.lineJoin = memberOf({
      set: LineJoin,
      value
    }) ?? this.state.lineJoin;
  }

  /** How long a miter may be, in line widths; a value that is not positive is ignored. */
  get miterLimit() {
    return this.state.miterLimit;
  }

  set miterLimit(value: number) {
    const isValid = Number.isFinite(value) && value > 0;
    if (isValid) {
      this.state.miterLimit = value;
    }
  }

  /** Sets the dash pattern: lengths of dashes and gaps in pixels; an odd count is repeated, a bad list ignored. */
  setLineDash(segments: number[]) {
    const isValid = Array.isArray(segments) && segments.every(length => Number.isFinite(length) && length >= 0);
    if (!isValid) {
      return;
    }

    const isOdd = segments.length % 2 === 1;
    this.state.lineDash = isOdd ? [...segments, ...segments] : [...segments];
  }

  /** The dash pattern. */
  getLineDash() {
    return [...this.state.lineDash];
  }

  /** Where in the dash pattern a line starts, in pixels. */
  get lineDashOffset() {
    return this.state.lineDashOffset;
  }

  set lineDashOffset(value: number) {
    if (Number.isFinite(value)) {
      this.state.lineDashOffset = value;
    }
  }

  /** How opaque everything drawn is, from 0 to 1. */
  get globalAlpha() {
    return this.state.globalAlpha;
  }

  set globalAlpha(value: number) {
    const isValid = value >= 0 && value <= 1;
    if (isValid) {
      this.state.globalAlpha = value;
    }
  }

  /** How a shape combines with what is already drawn; the names the documentation lists, others are ignored. */
  get globalCompositeOperation() {
    return this.state.composite;
  }

  set globalCompositeOperation(value: string) {
    this.state.composite = memberOf({
      set: CompositeOperation,
      value
    }) ?? this.state.composite;
  }

  /** Whether images are smoothed when scaled. */
  get imageSmoothingEnabled() {
    return this.state.isSmoothing;
  }

  set imageSmoothingEnabled(isEnabled: boolean) {
    this.state.isSmoothing = Boolean(isEnabled);
  }

  /** How well images are smoothed: `low`, `medium` or `high`. */
  get imageSmoothingQuality() {
    return this.state.smoothingQuality;
  }

  set imageSmoothingQuality(value: ImageSmoothingQuality) {
    this.state.smoothingQuality = memberOf({
      set: ImageSmoothingQuality,
      value
    }) ?? this.state.smoothingQuality;
  }

  /** The color of shadows. */
  get shadowColor() {
    return this.state.shadowColorText;
  }

  set shadowColor(value: string) {
    const color = colorFromCss(value);
    const isColor = color !== undefined;
    if (isColor) {
      this.state.shadowColor = color;
      this.state.shadowColorText = cssFromColor(color);
    }
  }

  /** How soft shadows are, in pixels. */
  get shadowBlur() {
    return this.state.shadowBlur;
  }

  set shadowBlur(value: number) {
    const isValid = Number.isFinite(value) && value >= 0;
    if (isValid) {
      this.state.shadowBlur = value;
    }
  }

  /** How far shadows are moved right, in pixels. */
  get shadowOffsetX() {
    return this.state.shadowOffsetX;
  }

  set shadowOffsetX(value: number) {
    if (Number.isFinite(value)) {
      this.state.shadowOffsetX = value;
    }
  }

  /** How far shadows are moved down, in pixels. */
  get shadowOffsetY() {
    return this.state.shadowOffsetY;
  }

  set shadowOffsetY(value: number) {
    if (Number.isFinite(value)) {
      this.state.shadowOffsetY = value;
    }
  }

  /** The CSS font shorthand text is drawn in; a value that is not a font is ignored. */
  get font() {
    return this.state.font;
  }

  set font(value: string) {
    if (isFont(value)) {
      this.state.font = value.trim();
    }
  }

  /** Where text sits horizontally around its point. */
  get textAlign() {
    return this.state.textAlign;
  }

  set textAlign(value: TextAlign) {
    this.state.textAlign = memberOf({
      set: TextAlign,
      value
    }) ?? this.state.textAlign;
  }

  /** Where text sits vertically around its point. */
  get textBaseline() {
    return this.state.textBaseline;
  }

  set textBaseline(value: TextBaseline) {
    this.state.textBaseline = memberOf({
      set: TextBaseline,
      value
    }) ?? this.state.textBaseline;
  }

  /** The direction text reads, which `start` and `end` alignment follow. */
  get direction() {
    return this.state.direction;
  }

  set direction(value: TextDirection) {
    this.state.direction = memberOf({
      set: TextDirection,
      value
    }) ?? this.state.direction;
  }

  /** Always `none`: filters are not supported. */
  get filter() {
    return "none";
  }

  // Transforms

  private transformBy(matrix: Matrix3x2) {
    this.state.matrix = multiply({
      first: matrix,
      second: this.state.matrix
    });
  }

  /** Scales what is drawn after it. */
  scale(x: number, y: number) {
    if (isFiniteList([x, y])) {
      this.transformBy(
        scaling({
          x,
          y
        })
      );
    }
  }

  /** Turns what is drawn after it, by an angle in radians. */
  rotate(angle: number) {
    if (Number.isFinite(angle)) {
      this.transformBy(rotation({ radians: angle }));
    }
  }

  /** Moves what is drawn after it. */
  translate(x: number, y: number) {
    if (isFiniteList([x, y])) {
      this.transformBy(
        translation({
          x,
          y
        })
      );
    }
  }

  /** Multiplies the transform by a matrix (a, b, c, d are the linear part, e and f the move). */
  transform(scaleX: number, skewY: number, skewX: number, scaleY: number, moveX: number, moveY: number) {
    const matrix = matrixFromInit({
      a: scaleX,
      b: skewY,
      c: skewX,
      d: scaleY,
      e: moveX,
      f: moveY
    });
    if (isFiniteMatrix(matrix)) {
      this.transformBy(matrix);
    }
  }

  /** Replaces the transform with six numbers, or a matrix object with a to f; no argument resets it. */
  setTransform(
    scaleXOrMatrix?: number | MatrixInit,
    skewY?: number,
    skewX?: number,
    scaleY?: number,
    moveX?: number,
    moveY?: number
  ) {
    const isNumbers = typeof scaleXOrMatrix === "number";
    const matrix = matrixFromInit(
      isNumbers ? {
        a: scaleXOrMatrix,
        b: skewY,
        c: skewX,
        d: scaleY,
        e: moveX,
        f: moveY
      } : scaleXOrMatrix ?? {}
    );
    if (isFiniteMatrix(matrix)) {
      this.state.matrix = matrix;
    }
  }

  /** Puts the transform back to the identity. */
  resetTransform() {
    this.state.matrix = IDENTITY;
  }

  /** The transform, as a matrix with a to f. */
  getTransform() {
    const matrix = this.state.matrix;
    return {
      a: matrix.m11,
      b: matrix.m12,
      c: matrix.m21,
      d: matrix.m22,
      e: matrix.m31,
      f: matrix.m32,
      m11: matrix.m11,
      m12: matrix.m12,
      m21: matrix.m21,
      m22: matrix.m22,
      m41: matrix.m31,
      m42: matrix.m32,
      is2D: true,
      isIdentity: isIdentityMatrix(matrix)
    } satisfies TransformMatrix;
  }

  // Gradients and patterns

  /** A gradient along a line; add its colors with `addColorStop`. */
  createLinearGradient(startX: number, startY: number, endX: number, endY: number) {
    return new CanvasGradient({
      kind: "linear",
      startX,
      startY,
      endX,
      endY
    });
  }

  /**
   * A gradient between two circles; add its colors with `addColorStop`. Win2D has
   * one circle and an origin, so a start radius is exact only when both circles
   * share their center.
   */
  createRadialGradient(
    startX: number,
    startY: number,
    startRadius: number,
    endX: number,
    endY: number,
    endRadius: number
  ) {
    return new CanvasGradient({
      kind: "radial",
      startX,
      startY,
      startRadius,
      endX,
      endY,
      endRadius
    });
  }

  /**
   * Not supported: Win2D has no conic gradient brush.
   *
   * @throws {Error} always
   */
  createConicGradient(_angle: number, _centerX: number, _centerY: number) {
    throw new Error("Win2D has no conic gradient; use a radial or linear gradient");
  }

  /** A pattern that repeats an image: `repeat`, `repeat-x`, `repeat-y` or `no-repeat`. */
  createPattern(image: ImageSource, repetition: string | null) {
    const kind = repetitionOf(repetition);
    const isUnknown = kind === undefined;
    if (isUnknown) {
      throw new SyntaxError(`"${repetition}" is not a repetition`);
    }

    return new CanvasPattern(bitmapOf(image), kind);
  }

  // Paths

  private get devicePath() {
    this.path.matrix = this.state.matrix;
    return this.path;
  }

  /** Starts a new path, forgetting the current one. */
  beginPath() {
    this.path = new DevicePath();
  }

  /** Closes the current subpath with a line to its start. */
  closePath() {
    this.devicePath.closePath();
  }

  /** Starts a new subpath at a point. */
  moveTo(x: number, y: number) {
    this.devicePath.moveTo(x, y);
  }

  /** Adds a line to a point. */
  lineTo(x: number, y: number) {
    this.devicePath.lineTo(x, y);
  }

  /** Adds a cubic Bezier curve. */
  bezierCurveTo(control1X: number, control1Y: number, control2X: number, control2Y: number, x: number, y: number) {
    this.devicePath.bezierCurveTo(control1X, control1Y, control2X, control2Y, x, y);
  }

  /** Adds a quadratic Bezier curve. */
  quadraticCurveTo(controlX: number, controlY: number, x: number, y: number) {
    this.devicePath.quadraticCurveTo(controlX, controlY, x, y);
  }

  /**
   * Adds a circular arc.
   *
   * @throws {RangeError} when the radius is negative
   */
  arc(x: number, y: number, radius: number, startAngle: number, endAngle: number, isCounterclockwise = false) {
    this.devicePath.arc(x, y, radius, startAngle, endAngle, isCounterclockwise);
  }

  /**
   * Adds an arc of a given radius that touches two lines.
   *
   * @throws {RangeError} when the radius is negative
   */
  arcTo(firstX: number, firstY: number, secondX: number, secondY: number, radius: number) {
    this.devicePath.arcTo(firstX, firstY, secondX, secondY, radius);
  }

  /**
   * Adds an arc of an ellipse.
   *
   * @throws {RangeError} when a radius is negative
   */
  ellipse(
    x: number,
    y: number,
    radiusX: number,
    radiusY: number,
    rotationAngle: number,
    startAngle: number,
    endAngle: number,
    isCounterclockwise = false
  ) {
    this.devicePath.ellipse(x, y, radiusX, radiusY, rotationAngle, startAngle, endAngle, isCounterclockwise);
  }

  /** Adds a closed rectangle. */
  rect(x: number, y: number, width: number, height: number) {
    this.devicePath.rect(x, y, width, height);
  }

  /**
   * Adds a closed rectangle with rounded corners (one to four radii, as in `border-radius`).
   *
   * @throws {RangeError} when a radius is negative
   */
  roundRect(x: number, y: number, width: number, height: number, radii?: number | {
    x?: number;
    y?: number;
  } | (number | {
    x?: number;
    y?: number;
  })[]) {
    this.devicePath.roundRect(x, y, width, height, radii);
  }

  // The geometry of what is filled, stroked, clipped or hit-tested

  // User-space geometry of a Path2D, or of the current path (kept in device
  // space, so moved back by the inverse transform); undefined if there is none.
  private userGeometry({ path, rule }: {
    path: Path2D | undefined;
    rule: FillRule;
  }) {
    const isCurrent = path === undefined;
    const matrix = this.state.matrix;
    const isSingular = isCurrent && !isInvertible(matrix);
    if (isSingular) {
      return undefined;
    }

    return buildGeometry({
      creator: this.surface.device,
      segments: (path ?? this.path).segments,
      matrix: isCurrent ? invert(matrix) : IDENTITY,
      rule
    });
  }

  // Device-space geometry, for the clip and for point tests.
  private deviceGeometry({ path, rule }: {
    path: Path2D | undefined;
    rule: FillRule;
  }) {
    return buildGeometry({
      creator: this.surface.device,
      segments: (path ?? this.path).segments,
      matrix: path === undefined ? IDENTITY : this.state.matrix,
      rule
    });
  }

  // Paint

  private resolvePaint(style: PaintStyle) {
    const opacity = this.state.globalAlpha;
    const isGradient = style instanceof CanvasGradient;
    if (isGradient) {
      return {
        paint: style.brush({
          creator: this.surface.device,
          opacity
        }),
        bounds: undefined
      };
    }

    const isPattern = style instanceof CanvasPattern;
    if (isPattern) {
      return style.resolve({
        creator: this.surface.device,
        opacity
      });
    }

    return {
      paint: withOpacity({
        color: style.color,
        opacity
      }),
      bounds: undefined
    };
  }

  // Runs a drawing with a paint, limiting it to where a pattern that does not repeat covers.
  private withPaint({ session, style, draw }: {
    session: CanvasDrawingSession;
    style: PaintStyle;
    draw: (paint: Paint) => void;
  }) {
    const resolved = this.resolvePaint(style);
    const { bounds } = resolved;
    const isBounded = bounds !== undefined && style instanceof CanvasPattern && !style.isRepeating;
    if (!isBounded) {
      draw(resolved.paint);
      release(resolved.paint);
      return;
    }

    const area = CanvasGeometry.createRectangle(this.surface.device, bounds.x, bounds.y, bounds.width, bounds.height);
    const moved = area.transform(style.transform);
    const layer = session.createLayerWithOpacityAndClipGeometry(1, moved);
    draw(resolved.paint);
    layer.close();
    release(resolved.paint);
    area.close();
    moved.close();
  }

  private get hasShadow() {
    const { shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY } = this.state;
    return shadowColor.a > 0 && (shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0);
  }

  private clipped({ session, run }: {
    session: CanvasDrawingSession;
    run: () => void;
  }) {
    const { clip } = this.state;
    session.transform = IDENTITY;

    const isUnclipped = clip === undefined;
    if (isUnclipped) {
      run();
      return;
    }

    const layer = session.createLayerWithOpacityAndClipGeometry(1, clip);
    run();
    layer.close();
  }

  private drawComposited({ session, image, offsetX, offsetY, composite }: {
    session: CanvasDrawingSession;
    image: ICanvasImage;
    offsetX: number;
    offsetY: number;
    composite: CompositeOperation;
  }) {
    const bounds = image.getBounds(this.surface.device);
    const isEmpty = !(bounds.width > 0 && bounds.height > 0);
    if (isEmpty) {
      return;
    }

    session.transform = IDENTITY;
    session.drawImageAtCoordsWithSourceRectAndOpacityAndInterpolationAndComposite(
      image,
      bounds.x + offsetX,
      bounds.y + offsetY,
      bounds,
      1,
      CanvasImageInterpolation.Linear,
      COMPOSITES.get(composite) ?? CanvasComposite.SourceOver
    );
  }

  // Runs a drawing through the clip, the shadow and the compositing operation.
  private emit({ render, composite = this.state.composite, isShadowed = this.hasShadow }: {
    render: (session: CanvasDrawingSession) => void;
    composite?: CompositeOperation;
    isShadowed?: boolean;
  }) {
    const isDirect = composite === CompositeOperation.SOURCE_OVER && !isShadowed;
    this.surface.draw(session => {
      if (isDirect) {
        this.clipped({
          session,
          run: () => render(session)
        });
        return;
      }

      this.emitThroughList({
        session,
        render,
        composite,
        isShadowed
      });
    });
  }

  // The drawing goes to a command list first, because a shadow is an effect of
  // it and a compositing operation combines it with the canvas as a whole. The
  // clip goes on the list for an operation that is not source-over (a layer
  // would hide the canvas from it), and on the canvas for the shadow.
  private emitThroughList({ session, render, composite, isShadowed }: {
    session: CanvasDrawingSession;
    render: (session: CanvasDrawingSession) => void;
    composite: CompositeOperation;
    isShadowed: boolean;
  }) {
    const device = this.surface.device;
    const list = new CanvasCommandList(device);
    const listSession = list.createDrawingSession();
    const isClippedFirst = composite !== CompositeOperation.SOURCE_OVER;
    const paintList = () => {
      if (isClippedFirst) {
        this.clipped({
          session: listSession,
          run: () => render(listSession)
        });
        return;
      }

      listSession.transform = IDENTITY;
      render(listSession);
    };
    paintList();
    listSession.close();
    const place = () => {
      if (isShadowed) {
        this.drawShadow({
          session,
          list,
          composite
        });
      }

      this.drawComposited({
        session,
        image: list,
        offsetX: 0,
        offsetY: 0,
        composite
      });
    };
    if (isClippedFirst) {
      place();
    } else {
      this.clipped({
        session,
        run: place
      });
    }

    list.close();
  }

  private drawShadow({ session, list, composite }: {
    session: CanvasDrawingSession;
    list: CanvasCommandList;
    composite: CompositeOperation;
  }) {
    const { shadowColor, shadowBlur, shadowOffsetX, shadowOffsetY, globalAlpha } = this.state;
    const effect = new ShadowEffect();
    effect.source = list;
    effect.blurAmount = shadowBlur / SHADOW_BLUR_TO_DEVIATION;
    effect.shadowColor = withOpacity({
      color: shadowColor,
      opacity: globalAlpha
    });
    this.drawComposited({
      session,
      image: effect,
      offsetX: shadowOffsetX,
      offsetY: shadowOffsetY,
      composite
    });
    effect.close();
  }

  // Fill, stroke, clip

  private fillGeometryWith({ geometry, style }: {
    geometry: CanvasGeometry;
    style: PaintStyle;
  }) {
    const matrix = this.state.matrix;
    this.emit({
      render: session => {
        session.transform = matrix;
        this.withPaint({
          session,
          style,
          draw: paint => fillWith({
            session,
            geometry,
            paint
          })
        });
      }
    });
    geometry.close();
  }

  private strokeGeometryWith({ geometry, style }: {
    geometry: CanvasGeometry;
    style: PaintStyle;
  }) {
    const matrix = this.state.matrix;
    const strokeStyle = createStrokeStyle(this.state);
    this.emit({
      render: session => {
        session.transform = matrix;
        this.withPaint({
          session,
          style,
          draw: paint => strokeWith({
            session,
            geometry,
            paint,
            width: this.state.lineWidth,
            style: strokeStyle
          })
        });
      }
    });
    strokeStyle.close();
    geometry.close();
  }

  /** Fills the current path (or a Path2D) with `fillStyle`; the rule is `nonzero` or `evenodd`. */
  fill(pathOrRule?: Path2D | FillRule, rule?: FillRule) {
    const path = pathOrRule instanceof Path2D ? pathOrRule : undefined;
    const geometry = this.userGeometry({
      path,
      rule: fillRuleOf(path === undefined ? pathOrRule : rule)
    });
    const isDrawable = geometry !== undefined;
    if (isDrawable) {
      this.fillGeometryWith({
        geometry,
        style: this.state.fillStyle
      });
    }
  }

  /** Draws the outline of the current path (or a Path2D) with `strokeStyle`. */
  stroke(path?: Path2D) {
    const geometry = this.userGeometry({
      path,
      rule: FillRule.NONZERO
    });
    const isDrawable = geometry !== undefined;
    if (isDrawable) {
      this.strokeGeometryWith({
        geometry,
        style: this.state.strokeStyle
      });
    }
  }

  /** Limits later drawing to inside the current path (or a Path2D); only restore() lifts it. */
  clip(pathOrRule?: Path2D | FillRule, rule?: FillRule) {
    const path = pathOrRule instanceof Path2D ? pathOrRule : undefined;
    const region = this.deviceGeometry({
      path,
      rule: fillRuleOf(path === undefined ? pathOrRule : rule)
    });
    const { clip } = this.state;
    this.state.clip = clip === undefined ? region : clip.combineWith(region, IDENTITY, CanvasGeometryCombine.Intersect);

    const hasClip = clip !== undefined;
    if (hasClip) {
      region.close();
    }
  }

  /** Whether a point (in canvas pixels, whatever the transform) is inside the current path or a Path2D. */
  isPointInPath(pathOrX: Path2D | number, xOrY: number, yOrRule?: number | FillRule, rule?: FillRule) {
    const isPath = pathOrX instanceof Path2D;
    const point = isPath ? {
      x: xOrY,
      y: Number(yOrRule)
    } : {
      x: pathOrX,
      y: xOrY
    };
    const geometry = this.deviceGeometry({
      path: isPath ? pathOrX : undefined,
      rule: fillRuleOf(isPath ? rule : yOrRule)
    });
    const isInside = isFiniteList([point.x, point.y]) && geometry.fillContainsPoint(point);
    geometry.close();
    return isInside;
  }

  /**
   * Whether a point (in canvas pixels, whatever the transform) is on the outline
   * of the current path or a Path2D, as `stroke` would draw it.
   */
  isPointInStroke(pathOrX: Path2D | number, xOrY: number, y?: number) {
    const isPath = pathOrX instanceof Path2D;
    const device = isPath ? {
      x: xOrY,
      y: Number(y)
    } : {
      x: pathOrX,
      y: xOrY
    };
    const geometry = this.userGeometry({
      path: isPath ? pathOrX : undefined,
      rule: FillRule.NONZERO
    });
    const isReadable = geometry !== undefined && isFiniteList([device.x, device.y]) && isInvertible(this.state.matrix);
    if (!isReadable) {
      return false;
    }

    const strokeStyle = createStrokeStyle(this.state);
    const isOnStroke = geometry.strokeContainsPointWithStrokeStyle(
      applyToPoint({
        matrix: invert(this.state.matrix),
        ...device
      }), this.state.lineWidth, strokeStyle
    );
    strokeStyle.close();
    geometry.close();
    return isOnStroke;
  }

  // Rectangles

  // A rectangle with a positive size, or undefined when there is nothing to draw.
  private drawableBox({ x, y, width, height }: Rectangle) {
    const isDrawable = isFiniteList([x, y, width, height]) && width !== 0 && height !== 0;
    return isDrawable ? {
      x: Math.min(x, x + width),
      y: Math.min(y, y + height),
      width: Math.abs(width),
      height: Math.abs(height)
    } : undefined;
  }

  // Fills a rectangle with the fill style, or clears it (opaque, whatever the alpha, shadow and operation).
  private paintRectangle({ rectangle, isClearing }: {
    rectangle: Rectangle;
    isClearing: boolean;
  }) {
    const box = this.drawableBox(rectangle);
    const isNothing = box === undefined;
    if (isNothing) {
      return;
    }

    const matrix = this.state.matrix;
    this.emit({
      composite: isClearing ? CompositeOperation.DESTINATION_OUT : this.state.composite,
      isShadowed: !isClearing && this.hasShadow,
      render: session => {
        session.transform = matrix;

        if (isClearing) {
          fillBox({
            session,
            ...box,
            paint: OPAQUE_BLACK
          });
          return;
        }

        this.withPaint({
          session,
          style: this.state.fillStyle,
          draw: paint => fillBox({
            session,
            ...box,
            paint
          })
        });
      }
    });
  }

  /** Fills a rectangle with `fillStyle`. */
  fillRect(x: number, y: number, width: number, height: number) {
    this.paintRectangle({
      rectangle: {
        x,
        y,
        width,
        height
      },
      isClearing: false
    });
  }

  /** Draws the outline of a rectangle with `strokeStyle`. */
  strokeRect(x: number, y: number, width: number, height: number) {
    const isDrawable = isFiniteList([x, y, width, height]) && (width !== 0 || height !== 0);
    if (!isDrawable) {
      return;
    }

    this.strokeGeometryWith({
      geometry: CanvasGeometry.createRectangle(this.surface.device, x, y, width, height),
      style: this.state.strokeStyle
    });
  }

  /** Makes a rectangle transparent, inside the clip. */
  clearRect(x: number, y: number, width: number, height: number) {
    this.paintRectangle({
      rectangle: {
        x,
        y,
        width,
        height
      },
      isClearing: true
    });
  }

  // Text

  private drawText({ text, x, y, maxWidth, isStroke }: {
    text: string;
    x: number;
    y: number;
    maxWidth: number | undefined;
    isStroke: boolean;
  }) {
    const font = parseFont(this.state.font);
    const hasLimit = maxWidth !== undefined;
    const isDrawable = font !== undefined && isFiniteList([x, y]) && (!hasLimit || maxWidth > 0);
    if (!isDrawable) {
      return;
    }

    const placed = placeText({
      creator: this.surface.device,
      text,
      font,
      align: this.state.textAlign,
      baseline: this.state.textBaseline,
      direction: this.state.direction
    });
    const isTooWide = hasLimit && placed.width > maxWidth;
    const matrix = multiply({
      first: scaling({
        x: isTooWide ? maxWidth / placed.width : 1,
        y: 1,
        centerX: x,
        centerY: y
      }),
      second: this.state.matrix
    });
    const style = isStroke ? this.state.strokeStyle : this.state.fillStyle;
    const strokeStyle = createStrokeStyle(this.state);
    this.emit({
      render: session => {
        session.transform = matrix;
        this.withPaint({
          session,
          style,
          draw: paint => this.drawLaidOutText({
            session,
            placed,
            paint,
            origin: {
              x,
              y
            },
            stroke: isStroke ? strokeStyle : undefined
          })
        });
      }
    });
    strokeStyle.close();
    placed.layout.close();
  }

  private drawLaidOutText({ session, placed, paint, origin, stroke }: {
    session: CanvasDrawingSession;
    placed: ReturnType<typeof placeText>;
    paint: Paint;
    origin: {
      x: number;
      y: number;
    };
    stroke: ReturnType<typeof createStrokeStyle> | undefined;
  }) {
    const left = origin.x + placed.left;
    const top = origin.y + placed.top;
    const isFilled = stroke === undefined;
    if (isFilled) {
      drawLayout({
        session,
        layout: placed.layout,
        x: left,
        y: top,
        paint
      });
      return;
    }

    const outline = CanvasGeometry.createText(placed.layout);
    strokeWith({
      session,
      geometry: outline,
      paint,
      width: this.state.lineWidth,
      style: stroke,
      x: left,
      y: top
    });
    outline.close();
  }

  /** Draws text with `fillStyle`; wider than `maxWidth`, it is squeezed to fit. */
  fillText(text: string, x: number, y: number, maxWidth?: number) {
    this.drawText({
      text,
      x,
      y,
      maxWidth,
      isStroke: false
    });
  }

  /** Draws the outline of text with `strokeStyle`. */
  strokeText(text: string, x: number, y: number, maxWidth?: number) {
    this.drawText({
      text,
      x,
      y,
      maxWidth,
      isStroke: true
    });
  }

  /** Measures text in the current font: `width` is its advance, the bounding boxes are around its ink. */
  measureText(text: string) {
    const font = parseFont(this.state.font);
    const isUnreadable = font === undefined;
    if (isUnreadable) {
      return this.emptyMetrics();
    }

    const placed = placeText({
      creator: this.surface.device,
      text,
      font,
      align: this.state.textAlign,
      baseline: this.state.textBaseline,
      direction: this.state.direction
    });
    const ink = placed.layout.drawBounds;
    placed.layout.close();
    return {
      width: placed.width,
      actualBoundingBoxLeft: -(placed.left + ink.x),
      actualBoundingBoxRight: placed.left + ink.x + ink.width,
      actualBoundingBoxAscent: -(placed.top + ink.y),
      actualBoundingBoxDescent: placed.top + ink.y + ink.height,
      fontBoundingBoxAscent: -placed.top,
      fontBoundingBoxDescent: placed.top + placed.height,
      emHeightAscent: placed.ascent,
      emHeightDescent: placed.height - placed.ascent
    } satisfies TextMetrics;
  }

  private emptyMetrics() {
    return {
      width: 0,
      actualBoundingBoxLeft: 0,
      actualBoundingBoxRight: 0,
      actualBoundingBoxAscent: 0,
      actualBoundingBoxDescent: 0,
      fontBoundingBoxAscent: 0,
      fontBoundingBoxDescent: 0,
      emHeightAscent: 0,
      emHeightDescent: 0
    } satisfies TextMetrics;
  }

  // Images

  /**
   * Draws an image: at a point, scaled into a rectangle, or a part of it scaled
   * into a rectangle (three, five or nine arguments, as the platform's drawImage).
   *
   * @throws {RangeError} when the number of arguments is not three, five or nine
   */
  drawImage(
    image: ImageSource,
    first: number,
    second: number,
    third?: number,
    fourth?: number,
    fifth?: number,
    sixth?: number,
    seventh?: number,
    eighth?: number
  ) {
    const bitmap = bitmapOf(image);
    const { width, height } = bitmap.sizeInPixels;
    const copy = planImage({
      image: {
        x: 0,
        y: 0,
        width,
        height
      },
      numbers: [first, second, third, fourth, fifth, sixth, seventh, eighth]
    });
    const isDrawable = copy !== undefined;
    if (isDrawable) {
      this.paintBitmap({
        bitmap,
        ...copy
      });
    }
  }

  private get interpolation() {
    const { isSmoothing, smoothingQuality } = this.state;
    if (!isSmoothing) {
      return CanvasImageInterpolation.NearestNeighbor;
    }

    return SMOOTHING.get(smoothingQuality) ?? CanvasImageInterpolation.Linear;
  }

  private paintBitmap({ bitmap, source, destination }: {
    bitmap: CanvasBitmap;
    source: Rectangle;
    destination: Rectangle;
  }) {
    const matrix = this.state.matrix;
    const interpolation = this.interpolation;
    const isOwnPixels = this.surface.owns(bitmap);
    // Direct2D cannot draw a surface onto itself: a copy stands in.
    const picture = isOwnPixels ? this.snapshot() : bitmap;
    const dipsPerPixel = picture.convertPixelsToDips(1);
    this.emit({
      render: session => {
        session.transform = matrix;
        session.drawImageToRectWithSourceRectAndOpacityAndInterpolation(picture, destination, {
          x: source.x * dipsPerPixel,
          y: source.y * dipsPerPixel,
          width: source.width * dipsPerPixel,
          height: source.height * dipsPerPixel
        }, this.state.globalAlpha, interpolation);
      }
    });

    if (isOwnPixels) {
      picture.close();
    }
  }

  private snapshot() {
    const target = this.surface.target;
    const { width, height } = target.sizeInPixels;
    const copy = createRenderTarget({
      creator: this.surface.device,
      width,
      height
    });
    copy.copyPixelsFromBitmap(target);
    return copy;
  }

  // Pixels

  /**
   * A blank image of a size, or one of the same size as another.
   *
   * @throws {RangeError} when a size is not a positive integer
   */
  createImageData(sizeOrImage: number | ImageData, height?: number) {
    const isImage = sizeOrImage instanceof ImageData;
    return isImage ? new ImageData(sizeOrImage.width, sizeOrImage.height) : new ImageData(sizeOrImage, height ?? 0);
  }

  /**
   * The pixels of a rectangle as RGBA bytes (not premultiplied); outside the
   * canvas they are transparent black.
   *
   * @throws {RangeError} when the size is zero or not an integer
   */
  getImageData(x: number, y: number, width: number, height: number) {
    return readImageData({
      surface: this.surface,
      x: Math.trunc(x),
      y: Math.trunc(y),
      width: Math.abs(Math.trunc(width)),
      height: Math.abs(Math.trunc(height))
    });
  }

  /**
   * Writes pixels (or the part named by the dirty rectangle) at a point,
   * ignoring transform, clip, alpha and compositing.
   */
  putImageData(
    image: ImageData,
    x: number,
    y: number,
    dirtyX = 0,
    dirtyY = 0,
    dirtyWidth = image.width,
    dirtyHeight = image.height
  ) {
    const left = Math.max(0, Math.min(dirtyX, dirtyX + dirtyWidth));
    const top = Math.max(0, Math.min(dirtyY, dirtyY + dirtyHeight));
    const right = Math.min(image.width, Math.max(dirtyX, dirtyX + dirtyWidth));
    const bottom = Math.min(image.height, Math.max(dirtyY, dirtyY + dirtyHeight));
    const isFiniteBox = isFiniteList([x, y, dirtyX, dirtyY, dirtyWidth, dirtyHeight]);
    if (!isFiniteBox) {
      return;
    }

    writeImageData({
      surface: this.surface,
      image,
      x: Math.trunc(x),
      y: Math.trunc(y),
      dirty: {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
      }
    });
  }

  /** Does nothing: there is no focus ring to draw. */
  drawFocusIfNeeded() {
    // The platform draws a ring around a focused element; there is no element here.
  }
}
