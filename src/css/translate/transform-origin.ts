import type { WriteContext } from "./property-kit.ts";

const PERCENT_SCALE = 100;
export const ORIGIN_TARGET = "origin";

/**
 * The write that sets only RenderTransformOrigin, for an element whose
 * RenderTransform is in use (WinUI refuses CenterPoint then).
 */
export const RENDER_ORIGIN_TARGET = "render-origin";

/** The separator between the horizontal and the vertical coordinate of an origin. */
export const AXIS_SEPARATOR = ",";

/** CSS's default `transform-origin`: the element's centre. */
export const DEFAULT_ORIGIN = "50%,50%";

/** A point in an element, in device-independent pixels from its top-left corner. */
interface OriginPoint {
  x: number;
  y: number;
}

/** Where an element's transforms pivot, in the two units WinUI's properties take. */
interface ElementOrigin {
  absolute: OriginPoint;
  relative: OriginPoint;
}

// One coordinate in pixels and as a fraction of the size (0 until the element has one).
function resolveCoordinate({ text, size }: {
  text: string;
  size: number;
}) {
  const amount = Number.parseFloat(text);
  const isPercent = text.endsWith("%");
  if (isPercent) {
    return {
      pixels: amount / PERCENT_SCALE * size,
      fraction: amount / PERCENT_SCALE
    };
  }

  return {
    pixels: amount,
    fraction: size === 0 ? 0 : amount / size
  };
}

/**
 * The point `value` (as `parseTransformOrigin` wrote it) names in an element of
 * this size: `absolute` in device-independent pixels from its top-left corner
 * (what CenterPoint takes), `relative` as fractions of its size (what
 * RenderTransformOrigin takes).
 */
function resolveTransformOrigin({ value, width, height }: {
  value: string;
  width: number;
  height: number;
}) {
  const [horizontal = "50%", vertical = "50%"] = value.split(AXIS_SEPARATOR);
  const x = resolveCoordinate({
    text: horizontal,
    size: width
  });
  const y = resolveCoordinate({
    text: vertical,
    size: height
  });
  return {
    absolute: {
      x: x.pixels,
      y: y.pixels
    },
    relative: {
      x: x.fraction,
      y: y.fraction
    }
  } satisfies ElementOrigin;
}

function pivot({ context, hasCenterPoint }: {
  context: WriteContext;
  hasCenterPoint: boolean;
}) {
  const { native, control, value } = context;
  function size(property: string) {
    return Number(
      native.read({
        control,
        property
      }) ?? 0
    );
  }

  function place() {
    const { absolute, relative } = resolveTransformOrigin({
      value,
      width: size("actualWidth"),
      height: size("actualHeight")
    });
    // WinUI refuses CenterPoint on an element whose RenderTransformOrigin is in use, so the
    // composition properties (scale, rotate) set the first and a RenderTransform the second.
    native.assign(control, hasCenterPoint ? {
      centerPoint: {
        x: absolute.x,
        y: absolute.y,
        z: 0
      }
    } : { renderTransformOrigin: relative });
  }

  place();
  return native.subscribe(control, "SizeChanged", place);
}

/** The `origin` write: CenterPoint and RenderTransformOrigin follow the element's size. */
export function pivotAbout(context: WriteContext) {
  return pivot({
    context,
    hasCenterPoint: true
  });
}

/** The `render-origin` write: RenderTransformOrigin follows the element's size. */
export function pivotRenderTransform(context: WriteContext) {
  return pivot({
    context,
    hasCenterPoint: false
  });
}
