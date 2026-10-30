import type { PathCommand } from "#src/css/parse/svg-path.js";
import { projectAs } from "#winui/lifetime";
import { ArcSegment } from "#winui/microsoft/ui/xaml/media/ArcSegment";
import { BezierSegment } from "#winui/microsoft/ui/xaml/media/BezierSegment";
import { EllipseGeometry } from "#winui/microsoft/ui/xaml/media/EllipseGeometry";
import { GeometryGroup } from "#winui/microsoft/ui/xaml/media/GeometryGroup";
import { LineGeometry } from "#winui/microsoft/ui/xaml/media/LineGeometry";
import { LineSegment } from "#winui/microsoft/ui/xaml/media/LineSegment";
import { PathGeometry } from "#winui/microsoft/ui/xaml/media/PathGeometry";
import { PolyBezierSegment } from "#winui/microsoft/ui/xaml/media/PolyBezierSegment";
import { PolyLineSegment } from "#winui/microsoft/ui/xaml/media/PolyLineSegment";
import { PolyQuadraticBezierSegment } from "#winui/microsoft/ui/xaml/media/PolyQuadraticBezierSegment";
import { QuadraticBezierSegment } from "#winui/microsoft/ui/xaml/media/QuadraticBezierSegment";
import { RectangleGeometry } from "#winui/microsoft/ui/xaml/media/RectangleGeometry";
import { SweepDirection } from "#winui/microsoft/ui/xaml/media/SweepDirection";

// A WinUI geometry (what a Path holds in its Data) as path commands, which Win2D
// can measure. A geometry is a projected base class: its own members are reached
// by asking WinUI for the class it is, which fails for any other.

interface Point {
  x: number;
  y: number;
}

interface Indexed<Item> {
  readonly size: number;
  getAt(index: number): Item;
}

interface ProjectedType<Instance extends object> {
  readonly prototype: Instance;
}

const QUADRATIC_STRIDE = 2;
const CUBIC_STRIDE = 3;

function asType<Instance extends object>({ value, type }: {
  value: unknown;
  type: ProjectedType<Instance>;
}) {
  try {
    return projectAs(value, type);
  } catch {
    return null;
  }
}

function itemsOf<Item>(collection: Indexed<Item>) {
  return Array.from({ length: collection.size }, (_unused, iItem) => collection.getAt(iItem));
}

// The commands as a list of any kind (the kinds of one function's returns would else be a union of lists).
function list(commands: PathCommand[]) {
  return commands;
}

function lineTo(point: Point) {
  return {
    kind: "line",
    x: point.x,
    y: point.y
  } satisfies PathCommand;
}

function groupsOf<Item>({ items, size }: {
  items: readonly Item[];
  size: number;
}) {
  const count = Math.floor(items.length / size);
  return Array.from({ length: count }, (_unused, iGroup) => items.slice(iGroup * size, (iGroup + 1) * size));
}

function cubicTo([first, second, third]: readonly Point[]) {
  const isWhole = first !== undefined && second !== undefined && third !== undefined;
  return isWhole ? [{
    kind: "cubic",
    x1: first.x,
    y1: first.y,
    x2: second.x,
    y2: second.y,
    x: third.x,
    y: third.y
  } satisfies PathCommand] : [];
}

function quadraticTo([control, end]: readonly Point[]) {
  const isWhole = control !== undefined && end !== undefined;
  return isWhole ? [{
    kind: "quadratic",
    x1: control.x,
    y1: control.y,
    x: end.x,
    y: end.y
  } satisfies PathCommand] : [];
}

// The segment as commands, by the class it turns out to be.
function segmentCommands(segment: unknown) {
  const line = asType({
    value: segment,
    type: LineSegment
  });
  const hasLine = line !== null;
  if (hasLine) {
    return list([lineTo(line.point)]);
  }

  const lines = asType({
    value: segment,
    type: PolyLineSegment
  });
  const hasLines = lines !== null;
  if (hasLines) {
    return list(itemsOf(lines.points).map(point => lineTo(point)));
  }

  const bezier = asType({
    value: segment,
    type: BezierSegment
  });
  const hasBezier = bezier !== null;
  if (hasBezier) {
    return list(cubicTo([bezier.point1, bezier.point2, bezier.point3]));
  }

  const beziers = asType({
    value: segment,
    type: PolyBezierSegment
  });
  const hasBeziers = beziers !== null;
  if (hasBeziers) {
    return list(
      groupsOf({
        items: itemsOf(beziers.points),
        size: CUBIC_STRIDE
      }).flatMap(points => cubicTo(points))
    );
  }

  const quadratic = asType({
    value: segment,
    type: QuadraticBezierSegment
  });
  const hasQuadratic = quadratic !== null;
  if (hasQuadratic) {
    return list(quadraticTo([quadratic.point1, quadratic.point2]));
  }

  const quadratics = asType({
    value: segment,
    type: PolyQuadraticBezierSegment
  });
  const hasQuadratics = quadratics !== null;
  if (hasQuadratics) {
    return list(
      groupsOf({
        items: itemsOf(quadratics.points),
        size: QUADRATIC_STRIDE
      }).flatMap(points => quadraticTo(points))
    );
  }

  const arc = asType({
    value: segment,
    type: ArcSegment
  });
  return arc === null ? list([]) : list([{
    kind: "arc",
    radiusX: arc.size.width,
    radiusY: arc.size.height,
    rotation: arc.rotationAngle,
    isLarge: arc.isLargeArc,
    isSweep: arc.sweepDirection === SweepDirection.Clockwise,
    x: arc.point.x,
    y: arc.point.y
  }]);
}

function rectangleCommands({ x, y, width, height }: {
  x: number;
  y: number;
  width: number;
  height: number;
}) {
  return [
    {
      kind: "move",
      x,
      y
    },
    lineTo({
      x: x + width,
      y
    }),
    lineTo({
      x: x + width,
      y: y + height
    }),
    lineTo({
      x,
      y: y + height
    }),
    { kind: "close" }
  ] satisfies PathCommand[];
}

function ellipseCommands({ center, radiusX, radiusY }: {
  center: Point;
  radiusX: number;
  radiusY: number;
}) {
  function arcTo(x: number) {
    return {
      kind: "arc",
      radiusX,
      radiusY,
      rotation: 0,
      isLarge: false,
      isSweep: true,
      x,
      y: center.y
    } satisfies PathCommand;
  }

  return [
    {
      kind: "move",
      x: center.x - radiusX,
      y: center.y
    },
    arcTo(center.x + radiusX),
    arcTo(center.x - radiusX),
    { kind: "close" }
  ] satisfies PathCommand[];
}

// What one geometry draws, and the geometries inside it when it is a group.
function geometryParts(geometry: unknown) {
  const path = asType({
    value: geometry,
    type: PathGeometry
  });
  const hasPath = path !== null;
  if (hasPath) {
    return {
      commands: list(
        itemsOf(path.figures).flatMap(figure => [
        {
          kind: "move",
          x: figure.startPoint.x,
          y: figure.startPoint.y
        } satisfies PathCommand,
        ...itemsOf(figure.segments).flatMap(segment => segmentCommands(segment)),
        ...figure.isClosed ? [{ kind: "close" } satisfies PathCommand] : []
        ])
      ),
      children: []
    };
  }

  const line = asType({
    value: geometry,
    type: LineGeometry
  });
  const hasLine = line !== null;
  if (hasLine) {
    return {
      commands: [
        {
          kind: "move",
          x: line.startPoint.x,
          y: line.startPoint.y
        } satisfies PathCommand,
        lineTo(line.endPoint)
      ],
      children: []
    };
  }

  const rectangle = asType({
    value: geometry,
    type: RectangleGeometry
  });
  const hasRectangle = rectangle !== null;
  if (hasRectangle) {
    return {
      commands: rectangleCommands(rectangle.rect),
      children: []
    };
  }

  const ellipse = asType({
    value: geometry,
    type: EllipseGeometry
  });
  const hasEllipse = ellipse !== null;
  if (hasEllipse) {
    return {
      commands: ellipseCommands(ellipse),
      children: []
    };
  }

  const group = asType({
    value: geometry,
    type: GeometryGroup
  });
  return {
    commands: list([]),
    children: group === null ? [] : itemsOf(group.children)
  };
}

/**
 * The commands of a geometry: a PathGeometry's figures, a line, a rectangle, an
 * ellipse, or a group of them. Anything else has none.
 */
export function commandsOfGeometry(geometry: unknown) {
  const pending = [geometry];
  const commands: PathCommand[] = [];
  for (const next of pending) {
    const parts = geometryParts(next);
    commands.push(...parts.commands);
    pending.push(...parts.children);
  }

  return commands;
}
