import { colorFromCss, cssFromColor } from "./css-color.ts";
import type { Rectangle } from "./image-plan.ts";
import { memberOf, Repetition } from "./names.ts";
import type { MatrixInit } from "./path.ts";
import { IDENTITY } from "#src/win2d/matrix.js";
import { CanvasImageBrush } from "#winui/microsoft/graphics/canvas/brushes/CanvasImageBrush";
import { CanvasLinearGradientBrush } from "#winui/microsoft/graphics/canvas/brushes/CanvasLinearGradientBrush";
import { CanvasRadialGradientBrush } from "#winui/microsoft/graphics/canvas/brushes/CanvasRadialGradientBrush";
import { CanvasAlphaMode } from "#winui/microsoft/graphics/canvas/CanvasAlphaMode";
import type { CanvasBitmap } from "#winui/microsoft/graphics/canvas/CanvasBitmap";
import type { Color, Matrix3x2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import { CanvasEdgeBehavior } from "#winui/microsoft/graphics/canvas/CanvasEdgeBehavior";
import type { ICanvasResourceCreator } from "#winui/microsoft/graphics/canvas/ICanvasResourceCreator";

const TRANSPARENT: Color = {
  a: 0,
  r: 0,
  g: 0,
  b: 0
};

interface Stop {
  position: number;
  color: Color;
}

/** The two shapes a gradient can have, with the numbers `createLinearGradient` and `createRadialGradient` take. */
export type GradientShape =
  | {
    kind: "linear";
    startX: number;
    startY: number;
    endX: number;
    endY: number;
  }
  | {
    kind: "radial";
    startX: number;
    startY: number;
    startRadius: number;
    endX: number;
    endY: number;
    endRadius: number;
  };

/** A solid color as `fillStyle` and `strokeStyle` keep it: the color and how it reads back. */
export interface SolidStyle {
  color: Color;
  text: string;
}

/** What a shape is painted with: a color, a gradient or a pattern. */
export type PaintStyle = SolidStyle | CanvasGradient | CanvasPattern;

/** The Win2D brushes this file makes, which can be closed once the drawing is done. */
export type OwnedBrush = CanvasImageBrush | CanvasLinearGradientBrush | CanvasRadialGradientBrush;

/** A paint, and the region outside which it paints nothing (a pattern that does not repeat). */
interface ResolvedPaint {
  paint: Color | OwnedBrush;
  bounds: Rectangle | undefined;
}

const UNBOUNDED_EXTENT = 1e7;

/**
 * A gradient made by `createLinearGradient` or `createRadialGradient`: add
 * color stops, then use it as a `fillStyle` or `strokeStyle`.
 */
export class CanvasGradient {
  private readonly shape: GradientShape;
  private readonly stops: Stop[] = [];

  constructor(shape: GradientShape) {
    this.shape = shape;
  }

  /**
   * Adds a color at a position from 0 to 1.
   *
   * @throws {RangeError} when the offset is not from 0 to 1
   * @throws {SyntaxError} when the color is not a CSS color
   */
  addColorStop(offset: number, color: string) {
    const isInRange = offset >= 0 && offset <= 1;
    if (!isInRange) {
      throw new RangeError("The offset provided is not between 0 and 1");
    }

    const parsed = colorFromCss(color);
    const isUnreadable = parsed === undefined;
    if (isUnreadable) {
      throw new SyntaxError(`"${color}" is not a CSS color`);
    }

    const iAfter = this.stops.findIndex(stop => stop.position > offset);
    const iInsert = iAfter === -1 ? this.stops.length : iAfter;
    this.stops.splice(iInsert, 0, {
      position: offset,
      color: parsed
    });
  }

  // Win2D has one circle with an origin offset; the canvas has two. A start
  // radius is folded into the stops (exact when the circles share a center).
  private radialStops(fraction: number) {
    const [first] = this.stops;
    const isFolded = fraction > 0 && first !== undefined;
    if (!isFolded) {
      return this.stops;
    }

    return [
      {
        position: 0,
        color: first.color
      },
      ...this.stops.map(stop => ({
        position: fraction + stop.position * (1 - fraction),
        color: stop.color
      }))
    ];
  }

  /** A Win2D brush with this gradient, or a transparent color when the canvas would paint nothing. */
  brush({ creator, opacity }: {
    creator: ICanvasResourceCreator;
    opacity: number;
  }) {
    const shape = this.shape;
    const isEmpty = this.stops.length === 0;
    const isPoint = shape.kind === "linear" && shape.startX === shape.endX && shape.startY === shape.endY;
    const isInverted = shape.kind === "radial" && shape.startRadius >= shape.endRadius && shape.startRadius > 0;
    const isNothing = isEmpty || isPoint || isInverted;
    if (isNothing) {
      return TRANSPARENT;
    }

    const isLinear = shape.kind === "linear";
    if (isLinear) {
      const brush = CanvasLinearGradientBrush.createWithEdgeBehaviorAndAlphaMode(
        creator,
        this.stops,
        CanvasEdgeBehavior.Clamp,
        CanvasAlphaMode.Straight
      );
      brush.startPoint = {
        x: shape.startX,
        y: shape.startY
      };
      brush.endPoint = {
        x: shape.endX,
        y: shape.endY
      };
      brush.opacity = opacity;
      return brush;
    }

    const brush = CanvasRadialGradientBrush.createWithEdgeBehaviorAndAlphaMode(
      creator,
      this.radialStops(shape.startRadius / shape.endRadius),
      CanvasEdgeBehavior.Clamp,
      CanvasAlphaMode.Straight
    );
    brush.center = {
      x: shape.endX,
      y: shape.endY
    };
    brush.originOffset = {
      x: shape.startX - shape.endX,
      y: shape.startY - shape.endY
    };
    brush.radiusX = shape.endRadius;
    brush.radiusY = shape.endRadius;
    brush.opacity = opacity;
    return brush;
  }
}

/** A pattern made by `createPattern`: an image repeated over the area painted. */
export class CanvasPattern {
  private readonly bitmap: CanvasBitmap;
  private readonly repetition: Repetition;
  private matrix: Matrix3x2 = IDENTITY;

  constructor(bitmap: CanvasBitmap, repetition: Repetition) {
    this.bitmap = bitmap;
    this.repetition = repetition;
  }

  /** Moves, turns or scales the pattern (a DOMMatrix's a to f); no argument resets it. */
  setTransform(transform: MatrixInit = {}) {
    this.matrix = {
      m11: transform.a ?? 1,
      m12: transform.b ?? 0,
      m21: transform.c ?? 0,
      m22: transform.d ?? 1,
      m31: transform.e ?? 0,
      m32: transform.f ?? 0
    };
  }

  /** A Win2D brush with the image; where the pattern does not repeat, the area it covers is returned too. */
  resolve({ creator, opacity }: {
    creator: ICanvasResourceCreator;
    opacity: number;
  }) {
    const brush = new CanvasImageBrush(creator, this.bitmap);
    const isRepeatingX = this.repetition === Repetition.REPEAT || this.repetition === Repetition.REPEAT_X;
    const isRepeatingY = this.repetition === Repetition.REPEAT || this.repetition === Repetition.REPEAT_Y;
    brush.extendX = isRepeatingX ? CanvasEdgeBehavior.Wrap : CanvasEdgeBehavior.Clamp;
    brush.extendY = isRepeatingY ? CanvasEdgeBehavior.Wrap : CanvasEdgeBehavior.Clamp;
    brush.transform = this.matrix;
    brush.opacity = opacity;
    const size = this.bitmap.size;
    return {
      paint: brush,
      bounds: {
        x: isRepeatingX ? -UNBOUNDED_EXTENT : 0,
        y: isRepeatingY ? -UNBOUNDED_EXTENT : 0,
        width: isRepeatingX ? 2 * UNBOUNDED_EXTENT : size.width,
        height: isRepeatingY ? 2 * UNBOUNDED_EXTENT : size.height
      }
    } satisfies ResolvedPaint;
  }

  /** The pattern's own matrix. */
  get transform() {
    return this.matrix;
  }

  /** Whether the image repeats in both directions, so it needs no bounds. */
  get isRepeating() {
    return this.repetition === Repetition.REPEAT;
  }
}

/** The repetition a `createPattern` argument names, or undefined. */
export function repetitionOf(value: string | null) {
  const isDefault = value === null || value === "";
  return isDefault ? Repetition.REPEAT : memberOf({
    set: Repetition,
    value
  });
}

/** A color style from CSS text, or undefined when the text is not a color. */
export function solidStyleOf(text: string) {
  const color = colorFromCss(text);
  return color === undefined ? undefined : {
    color,
    text: cssFromColor(color)
  } satisfies SolidStyle;
}
