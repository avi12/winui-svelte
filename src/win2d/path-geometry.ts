import type { PathCommand } from "#src/css/parse/svg-path.js";
import { CanvasArcSize } from "#winui/microsoft/graphics/canvas/geometry/CanvasArcSize";
import { CanvasFigureLoop } from "#winui/microsoft/graphics/canvas/geometry/CanvasFigureLoop";
import {
  CanvasFilledRegionDetermination
} from "#winui/microsoft/graphics/canvas/geometry/CanvasFilledRegionDetermination";
import { CanvasGeometry } from "#winui/microsoft/graphics/canvas/geometry/CanvasGeometry";
import { CanvasPathBuilder } from "#winui/microsoft/graphics/canvas/geometry/CanvasPathBuilder";
import { CanvasSweepDirection } from "#winui/microsoft/graphics/canvas/geometry/CanvasSweepDirection";
import type { ICanvasResourceCreator } from "#winui/microsoft/graphics/canvas/ICanvasResourceCreator";

// Path commands as a Win2D geometry: a clip-path's polygon or path(), and the
// outline whose length `draw` needs.

const HALF_TURN_DEGREES = 180;

/** What a path is filled by: the nonzero or the even-odd rule. */
export type FillRule = "nonzero" | "evenodd";

/**
 * The geometry of path commands. The pen is closed at the end of each figure
 * a move or the end of the commands finishes, so a path that was never closed
 * stays open (its length is that of its line, a fill closes it).
 */
export function geometryOfCommands({ creator, commands, rule = "nonzero" }: {
  creator: ICanvasResourceCreator;
  commands: readonly PathCommand[];
  rule?: FillRule;
}) {
  const builder = new CanvasPathBuilder(creator);
  const isEvenOdd = rule === "evenodd";
  const determination = isEvenOdd ? CanvasFilledRegionDetermination.Alternate : CanvasFilledRegionDetermination.Winding;
  builder.setFilledRegionDetermination(determination);
  let isFigureOpen = false;
  for (const command of commands) {
    const isMove = command.kind === "move";
    const isClose = command.kind === "close";
    const isMoveOverFigure = isMove && isFigureOpen;
    if (isMoveOverFigure) {
      builder.endFigure(CanvasFigureLoop.Open);
      isFigureOpen = false;
    }

    if (isMove) {
      builder.beginFigureAtCoords(command.x, command.y);
      isFigureOpen = true;
    }

    const isCloseOfFigure = isClose && isFigureOpen;
    if (isCloseOfFigure) {
      builder.endFigure(CanvasFigureLoop.Closed);
      isFigureOpen = false;
    }

    if (isFigureOpen) {
      drawSegment({
        builder,
        command
      });
    }
  }

  if (isFigureOpen) {
    builder.endFigure(CanvasFigureLoop.Open);
  }

  return CanvasGeometry.createPath(builder);
}

function drawSegment({ builder, command }: {
  builder: CanvasPathBuilder;
  command: PathCommand;
}) {
  const isLine = command.kind === "line";
  if (isLine) {
    builder.addLineWithCoords(command.x, command.y);
  }

  const isCubic = command.kind === "cubic";
  if (isCubic) {
    builder.addCubicBezier({
      x: command.x1,
      y: command.y1
    }, {
      x: command.x2,
      y: command.y2
    }, {
      x: command.x,
      y: command.y
    });
  }

  const isQuadratic = command.kind === "quadratic";
  if (isQuadratic) {
    builder.addQuadraticBezier({
      x: command.x1,
      y: command.y1
    }, {
      x: command.x,
      y: command.y
    });
  }

  const isArc = command.kind === "arc";
  if (isArc) {
    const sweep = command.isSweep ? CanvasSweepDirection.Clockwise : CanvasSweepDirection.CounterClockwise;
    const size = command.isLarge ? CanvasArcSize.Large : CanvasArcSize.Small;
    builder.addArcToPoint({
      x: command.x,
      y: command.y
    }, command.radiusX, command.radiusY, command.rotation * Math.PI / HALF_TURN_DEGREES, sweep, size);
  }
}

/** The length of the outline of path commands, in the pixels the commands are written in. */
export function lengthOfCommands({ creator, commands }: {
  creator: ICanvasResourceCreator;
  commands: readonly PathCommand[];
}) {
  const geometry = geometryOfCommands({
    creator,
    commands
  });
  const length = geometry.computePathLength();
  geometry.close();
  return length;
}
