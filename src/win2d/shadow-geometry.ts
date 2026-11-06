import type { ElementSize } from "./element-lifecycle.ts";
import type { ShadowLayer } from "#src/css/parse/box-shadow.js";
import type { ResolvedClip } from "#src/css/parse/clip-shapes.js";
import type { PathCommand } from "#src/css/parse/svg-path.js";

// Where a `box-shadow` layer is drawn, in numbers: a rectangle the element's
// size grown by the spread, shifted by the offset and blurred, with the element
// itself cut out of it (a CSS shadow is never seen through the border box).

const BLEED_SIGMAS = 3;
const SIGMAS_PER_BLUR_RADIUS = 2;

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
    {
      kind: "line",
      x: x + width,
      y
    },
    {
      kind: "line",
      x: x + width,
      y: y + height
    },
    {
      kind: "line",
      x,
      y: y + height
    },
    { kind: "close" }
  ] as const satisfies readonly PathCommand[];
}

/** How far a layer's shadow draws beyond the border box: the offset, the spread and three deviations of the blur. */
export function shadowReach(layer: ShadowLayer) {
  const blurReach = layer.blur / SIGMAS_PER_BLUR_RADIUS * BLEED_SIGMAS;
  return Math.ceil(Math.max(Math.abs(layer.x), Math.abs(layer.y)) + Math.max(layer.spread, 0) + blurReach);
}

/**
 * The sprite that casts one layer, relative to the element's top left: its
 * rectangle (the element grown by the spread), the shadow's offset and blur,
 * and the clip that keeps the shadow out from under the element.
 */
export function shadowFrame({ layer, size }: {
  layer: ShadowLayer;
  size: ElementSize;
}) {
  const reach = shadowReach(layer);
  const { spread } = layer;
  const width = Math.max(size.width + 2 * spread, 0);
  const height = Math.max(size.height + 2 * spread, 0);
  const hole = rectangleCommands({
    x: spread,
    y: spread,
    width: size.width,
    height: size.height
  });
  const everything = rectangleCommands({
    x: spread - reach,
    y: spread - reach,
    width: size.width + 2 * reach,
    height: size.height + 2 * reach
  });
  return {
    size: {
      x: width,
      y: height
    },
    offset: {
      x: 0 - spread,
      y: 0 - spread,
      z: 0
    },
    shadowOffset: {
      x: layer.x,
      y: layer.y,
      z: 0
    },
    blurRadius: layer.blur,
    isVisible: width > 0 && height > 0,
    clip: {
      kind: "path",
      rule: "evenodd",
      commands: [...everything, ...hole]
    } satisfies ResolvedClip
  };
}
