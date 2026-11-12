import type { Point } from "./geometry.ts";
import type { Rectangle, Size } from "#src/capture/region.js";

/** The corner radius of the cut-out and of the brackets that hug it. */
export const DEFAULT_SELECTION_RADIUS = 24;

/** How far each bracket runs along an edge. */
export const DEFAULT_BRACKET_ARM = 44;

const PATH_DECIMALS = 3;
const EVEN_ODD_FILL = "F0";

function formatNumber(value: number) {
  return Number(value.toFixed(PATH_DECIMALS));
}

function formatPoint({ x, y }: Point) {
  return `${formatNumber(x)},${formatNumber(y)}`;
}

function radiusOf({ selection, arm, radius }: {
  selection: Rectangle;
  arm: number;
  radius: number;
}) {
  return Math.min(radius, arm, selection.width / 2, selection.height / 2);
}

/**
 * The scrim as XAML path data: the whole area with the selection cut out of it
 * (even-odd fill), so the selection stays clear whatever the scrim's opacity.
 *
 * @param options - The area, the selection and the cut-out's corner radius.
 * @returns Path data for a `Path`'s `data`.
 */
export function scrimPath({ screen, selection, radius = DEFAULT_SELECTION_RADIUS }: {
  screen: Size;
  selection: Rectangle | undefined;
  radius?: number;
}) {
  const full = `M0,0 H${formatNumber(screen.width)} V${formatNumber(screen.height)} H0 Z`;
  const isBare = selection === undefined;
  if (isBare) {
    return `${EVEN_ODD_FILL} ${full}`;
  }

  const corner = radiusOf({
    selection,
    arm: Infinity,
    radius
  });
  const left = selection.x;
  const top = selection.y;
  const right = selection.x + selection.width;
  const bottom = selection.y + selection.height;
  const arc = `A${formatNumber(corner)},${formatNumber(corner)} 0 0 1`;
  const hole = [
    `M${formatPoint({
      x: left + corner,
      y: top
    })}`,
    `H${formatNumber(right - corner)}`,
    `${arc} ${formatPoint({
      x: right,
      y: top + corner
    })}`,
    `V${formatNumber(bottom - corner)}`,
    `${arc} ${formatPoint({
      x: right - corner,
      y: bottom
    })}`,
    `H${formatNumber(left + corner)}`,
    `${arc} ${formatPoint({
      x: left,
      y: bottom - corner
    })}`,
    `V${formatNumber(top + corner)}`,
    `${arc} ${formatPoint({
      x: left + corner,
      y: top
    })}`,
    "Z"
  ].join(" ");
  return `${EVEN_ODD_FILL} ${full} ${hole}`;
}

/**
 * A rounded L at each corner of a selection, as XAML path data in the
 * selection's own coordinates (its top left is 0,0).
 *
 * @param options - The selection's size, the arm length and the corner radius.
 * @returns Path data for a `Path`'s `data`.
 */
export function bracketPath({ size, arm = DEFAULT_BRACKET_ARM, radius = DEFAULT_SELECTION_RADIUS }: {
  size: Size;
  arm?: number;
  radius?: number;
}) {
  const reach = Math.min(arm, size.width / 2, size.height / 2);
  const corner = radiusOf({
    selection: {
      x: 0,
      y: 0,
      ...size
    },
    arm: reach,
    radius
  });
  const corners = [
    {
      x: 0,
      y: 0,
      acrossWay: 1,
      downWay: 1
    },
    {
      x: size.width,
      y: 0,
      acrossWay: -1,
      downWay: 1
    },
    {
      x: size.width,
      y: size.height,
      acrossWay: -1,
      downWay: -1
    },
    {
      x: 0,
      y: size.height,
      acrossWay: 1,
      downWay: -1
    }
  ];
  return corners.map(({ x, y, acrossWay, downWay }) => {
    const sweep = acrossWay === downWay ? 1 : 0;
    return [
      `M${formatPoint({
        x,
        y: y + downWay * reach
      })}`,
      `V${formatNumber(y + downWay * corner)}`,
      `A${formatNumber(corner)},${formatNumber(corner)} 0 0 ${sweep} ${formatPoint({
        x: x + acrossWay * corner,
        y
      })}`,
      `H${formatNumber(x + acrossWay * reach)}`
    ].join(" ");
  }).join(" ");
}

/**
 * Points as the text a `Polyline`'s `points` takes.
 *
 * @param points - The points of a stroke.
 * @returns Space-separated `x,y` pairs.
 */
export function pointsText(points: readonly Point[]) {
  return points.map(formatPoint).join(" ");
}
