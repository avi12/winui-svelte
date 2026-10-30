import { FillRule } from "./names.ts";
import type { Segment } from "./path.ts";
import { SegmentKind } from "./path.ts";
import { applyToPoint } from "./transform-math.ts";
import type { Matrix3x2, Vector2 } from "#winui/microsoft/graphics/canvas/CanvasDrawingSession";
import { CanvasFigureLoop } from "#winui/microsoft/graphics/canvas/geometry/CanvasFigureLoop";
import {
  CanvasFilledRegionDetermination
} from "#winui/microsoft/graphics/canvas/geometry/CanvasFilledRegionDetermination";
import { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";
import { CanvasPathBuilder } from "#winui/microsoft/graphics/canvas/geometry/CanvasPathBuilder";
import type { ICanvasResourceCreator } from "#winui/microsoft/graphics/canvas/ICanvasResourceCreator";

/**
 * A Win2D geometry from the steps of a path, each point moved by a matrix. The
 * rule says which regions are inside where the path crosses itself.
 */
export function buildGeometry({ creator, segments, matrix, rule }: {
  creator: ICanvasResourceCreator;
  segments: readonly Segment[];
  matrix: Matrix3x2;
  rule: FillRule;
}) {
  const builder = new CanvasPathBuilder(creator);
  const isEvenOdd = rule === FillRule.EVENODD;
  builder.setFilledRegionDetermination(
    isEvenOdd ? CanvasFilledRegionDetermination.Alternate : CanvasFilledRegionDetermination.Winding
  );
  function moved(point: Vector2) {
    return applyToPoint({
      matrix,
      ...point
    });
  }

  // A figure starts when its first line or curve arrives: Direct2D has no empty figures.
  let pending: Vector2 | undefined;
  let isBegun = false;
  function begin() {
    const start = pending;
    const isMissing = start === undefined;
    if (isMissing) {
      return;
    }

    builder.beginFigureAtCoords(start.x, start.y);
    pending = undefined;
    isBegun = true;
  }

  function end(loop: CanvasFigureLoop) {
    if (isBegun) {
      builder.endFigure(loop);
    }

    isBegun = false;
    pending = undefined;
  }

  for (const segment of segments) {
    const isMove = segment.kind === SegmentKind.MOVE;
    if (isMove) {
      end(CanvasFigureLoop.Open);
      pending = moved(segment.to);
    } else if (segment.kind === SegmentKind.CLOSE) {
      end(CanvasFigureLoop.Closed);
    } else if (segment.kind === SegmentKind.LINE) {
      begin();
      const to = moved(segment.to);
      builder.addLineWithCoords(to.x, to.y);
    } else if (segment.kind === SegmentKind.CUBIC) {
      begin();
      builder.addCubicBezier(moved(segment.control1), moved(segment.control2), moved(segment.to));
    } else {
      begin();
      builder.addQuadraticBezier(moved(segment.control), moved(segment.to));
    }
  }

  end(CanvasFigureLoop.Open);
  const geometry = CanvasGeometry.createPath(builder);
  builder.close();
  return geometry;
}
