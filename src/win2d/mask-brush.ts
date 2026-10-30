import { colorOfArgb } from "./argb.ts";
import { drawImage } from "./draw.ts";
import { loadBitmap, sharedDevice } from "./resources.ts";
import type { MaskSource } from "#src/css/parse/visual-effects.js";
import { CanvasComposition } from "#winui/microsoft/graphics/canvas/ui/composition/CanvasComposition";
import { DirectXAlphaMode } from "#winui/microsoft/graphics/direct-x/DirectXAlphaMode";
import { DirectXPixelFormat } from "#winui/microsoft/graphics/direct-x/DirectXPixelFormat";
import type { CompositionGraphicsDevice } from "#winui/microsoft/ui/composition/CompositionGraphicsDevice";
import { CompositionMappingMode } from "#winui/microsoft/ui/composition/CompositionMappingMode";
import type { Compositor } from "#winui/microsoft/ui/composition/Compositor";

// The mask of `mask-image` as a Composition brush whose alpha is the mask: a
// gradient brush for a gradient, a surface the image is drawn on for a url().

/** Where the mask is laid: the element's size, and how far the sprite that shows it reaches out of the element. */
export interface MaskArea {
  width: number;
  height: number;
  margin: number;
}

type Gradient = Extract<MaskSource, { kind: "gradient" }>["gradient"];

const graphicsDevices = new WeakMap<Compositor, CompositionGraphicsDevice>();

function graphicsDeviceOf(compositor: Compositor) {
  const known = graphicsDevices.get(compositor);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const device = CanvasComposition.createCompositionGraphicsDevice(compositor, sharedDevice());
  graphicsDevices.set(compositor, device);
  return device;
}

/**
 * Lays a gradient mask over the element's area: the gradient's points are
 * fractions of the element, and the sprite is `margin` larger on each side.
 */
export function createGradientBrush({ compositor, gradient, area }: {
  compositor: Compositor;
  gradient: Gradient;
  area: MaskArea;
}) {
  const { width, height, margin } = area;
  const place = (point: {
    x: number;
    y: number;
  }) => ({
    x: margin + point.x * width,
    y: margin + point.y * height
  });
  const stops = gradient.stops.map(stop => compositor.createColorGradientStop(stop.offset, colorOfArgb(stop.color)));
  const isLinear = gradient.kind === "linear";
  if (isLinear) {
    const brush = compositor.createLinearGradientBrush();
    brush.mappingMode = CompositionMappingMode.Absolute;
    brush.startPoint = place(gradient.start);
    brush.endPoint = place(gradient.end);
    for (const stop of stops) {
      brush.colorStops.append(stop);
    }

    return brush;
  }

  const brush = compositor.createRadialGradientBrush();
  brush.mappingMode = CompositionMappingMode.Absolute;
  brush.ellipseCenter = place(gradient.center);
  brush.ellipseRadius = {
    x: gradient.radiusX * width,
    y: gradient.radiusY * height
  };
  for (const stop of stops) {
    brush.colorStops.append(stop);
  }

  return brush;
}

/**
 * Draws an image onto a Composition surface and returns the brush of it,
 * stretched over the sprite that shows it.
 *
 * @throws {Error} when the image cannot be loaded
 */
export async function createImageBrush({ compositor, url }: {
  compositor: Compositor;
  url: string;
}) {
  const bitmap = await loadBitmap({
    creator: sharedDevice(),
    source: url
  });
  const { width, height } = bitmap.sizeInPixels;
  const surface = graphicsDeviceOf(compositor).createDrawingSurface2({
    width,
    height
  }, DirectXPixelFormat.B8G8R8A8UIntNormalized, DirectXAlphaMode.Premultiplied);
  const session = CanvasComposition.createDrawingSession(surface);
  drawImage({
    session,
    image: bitmap
  });
  session.close();
  return compositor.createSurfaceBrush(surface);
}

/** The brush of a mask: a gradient's, or an image's once it has loaded. */
export async function createMaskBrush({ compositor, mask, area }: {
  compositor: Compositor;
  mask: MaskSource;
  area: MaskArea;
}) {
  const isGradient = mask.kind === "gradient";
  if (isGradient) {
    return createGradientBrush({
      compositor,
      gradient: mask.gradient,
      area
    });
  }

  return createImageBrush({
    compositor,
    url: mask.url
  });
}
