import { isRecord, read } from "./reflect.ts";
import type { NativeValue } from "#src/native-value.js";

// `draw` from svelte/transition asks an SVG shape for `getTotalLength()`. A
// WinUI shape has no such method, so the length is worked out from what the
// shape holds. A `Path` has none: its geometry is WinUI's, with no way to
// measure it.

// The constants of Ramanujan's approximation of an ellipse's perimeter.
const RAMANUJAN_THREE = 3;
const RAMANUJAN_FOUR = 4;
const RAMANUJAN_TEN = 10;

function numberAt({ value, key }: {
  value: NativeValue;
  key: string;
}) {
  const number = read(value, key);
  return typeof number === "number" ? number : 0;
}

function distance({ from, to }: {
  from: NativeValue;
  to: NativeValue;
}) {
  return Math.hypot(
    numberAt({
      value: to,
      key: "x"
    }) - numberAt({
      value: from,
      key: "x"
    }), numberAt({
      value: to,
      key: "y"
    }) - numberAt({
      value: from,
      key: "y"
    })
  );
}

function pointsOf(control: NativeValue) {
  const points = read(control, "points");
  const size = numberAt({
    value: points,
    key: "size"
  });
  const getAt = read(points, "getAt");
  const isReadable = typeof getAt === "function";
  if (!isReadable) {
    return [];
  }

  return Array.from({ length: size }, (_, iPoint) => getAt.call(points, iPoint));
}

function polylineLength({ control, isClosed }: {
  control: NativeValue;
  isClosed: boolean;
}) {
  const points = pointsOf(control);
  let length = 0;
  for (const [iPoint, point] of points.entries()) {
    const next = points[iPoint + 1] ?? (isClosed ? points[0] : undefined);
    const isSegment = next !== undefined;
    if (isSegment) {
      length += distance({
        from: point,
        to: next
      });
    }
  }

  return length;
}

function lineLength(control: NativeValue) {
  return distance({
    from: {
      x: numberAt({
        value: control,
        key: "x1"
      }),
      y: numberAt({
        value: control,
        key: "y1"
      })
    },
    to: {
      x: numberAt({
        value: control,
        key: "x2"
      }),
      y: numberAt({
        value: control,
        key: "y2"
      })
    }
  });
}

function sizeOf(control: NativeValue) {
  const size = read(control, "actualSize");
  return {
    width: numberAt({
      value: size,
      key: "x"
    }),
    height: numberAt({
      value: size,
      key: "y"
    })
  };
}

function ellipseLength(control: NativeValue) {
  const { width, height } = sizeOf(control);
  const [radiusX, radiusY] = [width / 2, height / 2];
  const sum = radiusX + radiusY;
  const ratio = ((radiusX - radiusY) / sum) ** 2;
  const scale = 1 + RAMANUJAN_THREE * ratio / (RAMANUJAN_TEN + Math.sqrt(RAMANUJAN_FOUR - RAMANUJAN_THREE * ratio));
  return Math.PI * sum * scale;
}

function rectangleLength(control: NativeValue) {
  const { width, height } = sizeOf(control);
  return 2 * (width + height);
}

const measures = new Map<string, (control: NativeValue) => number>([
  ["line", lineLength],
  ["polyline", control => polylineLength({
    control,
    isClosed: false
  })],
  ["polygon", control => polylineLength({
    control,
    isClosed: true
  })],
  ["ellipse", ellipseLength],
  ["rectangle", rectangleLength]
]);

/**
 * The length of a shape's outline, in pixels.
 *
 * @param options - The shape's tag (`line`, `polyline`, `polygon`, `ellipse`, `rectangle`) and its control.
 * @returns The length.
 * @throws {Error} When the shape cannot be measured (a `path`: WinUI gives a geometry no length).
 */
export function shapeLength({ name, control }: {
  name: string;
  control: NativeValue;
}) {
  const measure = measures.get(name);
  const isMeasurable = measure !== undefined && isRecord(control);
  if (!isMeasurable) {
    throw new Error(`draw cannot measure a <${name}>: only a line, polyline, polygon, ellipse or rectangle has a length to draw`);
  }

  return measure(control);
}
