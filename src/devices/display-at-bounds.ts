import type { DisplayAreaInfo, PixelRectangle } from "./displays.svelte.ts";
import { windowsDisplaySource } from "./displays.svelte.ts";

function isSameRectangle({ first, second }: {
  first: PixelRectangle;
  second: PixelRectangle;
}) {
  const isSameOrigin = first.x === second.x && first.y === second.y;
  return isSameOrigin && first.width === second.width && first.height === second.height;
}

function isCentreInside({ rectangle, area }: {
  rectangle: PixelRectangle;
  area: PixelRectangle;
}) {
  const centreX = rectangle.x + rectangle.width / 2;
  const centreY = rectangle.y + rectangle.height / 2;
  const isInsideX = centreX >= area.x && centreX < area.x + area.width;
  return isInsideX && centreY >= area.y && centreY < area.y + area.height;
}

/**
 * The display a rectangle in physical screen pixels belongs to: the one whose
 * `outerBounds` it equals, or else the one that holds its centre (a window
 * that was moved or resized a little). A display left of or above the primary
 * has a negative origin.
 *
 * @param options - The rectangle, and `areas` to look in (the display areas
 * Windows lists now by default; that needs the Windows App SDK running, as
 * `displays` does).
 * @returns The display area, whose `id` is what `handle.cover` takes, or
 * `undefined` when no display has those bounds or holds that centre.
 */
export function displayAtBounds({ x, y, width, height, areas = windowsDisplaySource().list() }: PixelRectangle & {
  readonly areas?: readonly DisplayAreaInfo[];
}) {
  const rectangle = {
    x,
    y,
    width,
    height
  };
  return areas.find(({ outerBounds }) => isSameRectangle({
    first: outerBounds,
    second: rectangle
  })) ?? areas.find(({ outerBounds }) => isCentreInside({
    rectangle,
    area: outerBounds
  }));
}
