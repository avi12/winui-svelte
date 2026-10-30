import { geometryOfCommands } from "./path-geometry.ts";
import { sharedDevice } from "./resources.ts";
import type { ResolvedClip } from "#src/css/parse/clip-shapes.js";
import type { PathCommand } from "#src/css/parse/svg-path.js";
import { CompositionPath } from "#winui/microsoft/ui/composition/CompositionPath";
import type { Compositor } from "#winui/microsoft/ui/composition/Compositor";
import { IGeometrySource2D } from "#winui/windows/graphics/IGeometrySource2D";

// A clip-path shape as a Composition clip: Visual.Clip is a CompositionClip, and
// a CompositionGeometricClip takes any geometry, where UIElement.Clip takes only a
// RectangleGeometry. A circle, an ellipse and a rounded rectangle are Composition's
// own geometries; a polygon, a path or corners that differ are a path made by Win2D.

/** Where the clipped visual's top left is, in the visual that carries the clip. */
export interface ClipOffset {
  x: number;
  y: number;
}

type Corner = Extract<ResolvedClip, { kind: "rounded" }>["radii"][number];

function hasEqualCorners(radii: readonly Corner[]) {
  const [first] = radii;
  return radii.every(corner => corner.x === first?.x && corner.y === first?.y);
}

function roundedCommands({ x, y, width, height, radii }: {
  x: number;
  y: number;
  width: number;
  height: number;
  radii: readonly Corner[];
}) {
  const [topLeft, topRight, bottomRight, bottomLeft] = radii;
  const right = x + width;
  const bottom = y + height;
  function arc({ corner, endX, endY }: {
    corner: Corner | undefined;
    endX: number;
    endY: number;
  }) {
    return {
      kind: "arc",
      radiusX: corner?.x ?? 0,
      radiusY: corner?.y ?? 0,
      rotation: 0,
      isLarge: false,
      isSweep: true,
      x: endX,
      y: endY
    } as const satisfies PathCommand;
  }

  return [
    {
      kind: "move",
      x: x + (topLeft?.x ?? 0),
      y
    },
    {
      kind: "line",
      x: right - (topRight?.x ?? 0),
      y
    },
    arc({
      corner: topRight,
      endX: right,
      endY: y + (topRight?.y ?? 0)
    }),
    {
      kind: "line",
      x: right,
      y: bottom - (bottomRight?.y ?? 0)
    },
    arc({
      corner: bottomRight,
      endX: right - (bottomRight?.x ?? 0),
      endY: bottom
    }),
    {
      kind: "line",
      x: x + (bottomLeft?.x ?? 0),
      y: bottom
    },
    arc({
      corner: bottomLeft,
      endX: x,
      endY: bottom - (bottomLeft?.y ?? 0)
    }),
    {
      kind: "line",
      x,
      y: y + (topLeft?.y ?? 0)
    },
    arc({
      corner: topLeft,
      endX: x + (topLeft?.x ?? 0),
      endY: y
    }),
    { kind: "close" }
  ] as const satisfies readonly PathCommand[];
}

function pathGeometry({ compositor, commands, rule }: {
  compositor: Compositor;
  commands: readonly PathCommand[];
  rule: "nonzero" | "evenodd";
}) {
  const canvasGeometry = geometryOfCommands({
    creator: sharedDevice(),
    commands,
    rule
  });
  return compositor.createPathGeometry(new CompositionPath(canvasGeometry.as(IGeometrySource2D)));
}

function geometryOf({ compositor, shape }: {
  compositor: Compositor;
  shape: ResolvedClip;
}) {
  const isEllipse = shape.kind === "ellipse";
  if (isEllipse) {
    const ellipse = compositor.createEllipseGeometry();
    ellipse.center = {
      x: shape.x,
      y: shape.y
    };
    ellipse.radius = {
      x: shape.radiusX,
      y: shape.radiusY
    };
    return ellipse;
  }

  const isPolygon = shape.kind === "polygon";
  if (isPolygon) {
    const [first, ...rest] = shape.points;
    return pathGeometry({
      compositor,
      rule: shape.rule,
      commands: first === undefined ? [] : [
        {
          kind: "move",
          ...first
        },
        ...rest.map(point => ({
          kind: "line",
          ...point
        }) as const),
        { kind: "close" }
      ]
    });
  }

  const isPath = shape.kind === "path";
  if (isPath) {
    return pathGeometry({
      compositor,
      commands: shape.commands,
      rule: shape.rule
    });
  }

  const [corner] = shape.radii;
  const isRectangle = shape.radii.every(radius => radius.x === 0 && radius.y === 0);
  if (isRectangle) {
    const rectangle = compositor.createRectangleGeometry();
    rectangle.offset = {
      x: shape.x,
      y: shape.y
    };
    rectangle.size = {
      x: shape.width,
      y: shape.height
    };
    return rectangle;
  }

  const isUniform = hasEqualCorners(shape.radii) && corner !== undefined;
  if (isUniform) {
    const rounded = compositor.createRoundedRectangleGeometry();
    rounded.offset = {
      x: shape.x,
      y: shape.y
    };
    rounded.size = {
      x: shape.width,
      y: shape.height
    };
    rounded.cornerRadius = {
      x: corner.x,
      y: corner.y
    };
    return rounded;
  }

  return pathGeometry({
    compositor,
    commands: roundedCommands(shape),
    rule: "nonzero"
  });
}

function shiftedCommand({ command, offset }: {
  command: PathCommand;
  offset: ClipOffset;
}) {
  const isClose = command.kind === "close";
  if (isClose) {
    return command;
  }

  const moved = {
    ...command,
    x: command.x + offset.x,
    y: command.y + offset.y
  };
  const isCurve = command.kind === "cubic" || command.kind === "quadratic";
  if (!isCurve) {
    return moved;
  }

  return {
    ...moved,
    x1: command.x1 + offset.x,
    y1: command.y1 + offset.y,
    ...command.kind === "cubic" ? {
      x2: command.x2 + offset.x,
      y2: command.y2 + offset.y
    } : {}
  };
}

// The shape moved by `offset`.
function shifted({ shape, offset }: {
  shape: ResolvedClip;
  offset: ClipOffset;
}) {
  function move(point: ClipOffset) {
    return {
      x: point.x + offset.x,
      y: point.y + offset.y
    };
  }

  const isPolygon = shape.kind === "polygon";
  if (isPolygon) {
    return {
      ...shape,
      points: shape.points.map(move)
    } satisfies ResolvedClip;
  }

  const isPath = shape.kind === "path";
  if (isPath) {
    return {
      ...shape,
      commands: shape.commands.map(command => shiftedCommand({
        command,
        offset
      }))
    } satisfies ResolvedClip;
  }

  return {
    ...shape,
    ...move(shape)
  } satisfies ResolvedClip;
}

/**
 * A clip of the shape (in pixels of the element), moved by `offset` for a
 * visual whose top left is not the element's.
 */
export function createGeometricClip({ compositor, shape, offset }: {
  compositor: Compositor;
  shape: ResolvedClip;
  offset: ClipOffset;
}) {
  return compositor.createGeometricClip(
    geometryOf({
      compositor,
      shape: shifted({
        shape,
        offset
      })
    })
  );
}
