// The arithmetic of cropping and scaling a capture: plain functions, no
// WinRT, so a test runs them anywhere. Every rectangle is in the monitor's own
// physical pixels, from its top left.

/** A rectangle in physical pixels. */
export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A width and a height in pixels. */
export interface Size {
  readonly width: number;
  readonly height: number;
}

/** What `capturePlan` is given. */
export interface CapturePlanOptions {
  /** The captured surface as the capture sees it. */
  readonly surface: Size;

  /** The part to show, in the monitor's pixels; it may reach past the monitor. */
  readonly region: Rectangle;

  /** The size of the picture the region is stretched to fill. */
  readonly output: Size;
}

/** What to draw to fill the output with the region. */
export interface CapturePlan {
  /** The part of the monitor that lies inside the region; undefined when the region misses the monitor. */
  readonly source: Rectangle | undefined;

  /** Where `source` lands in the output; undefined when `source` is. The rest of the output stays empty. */
  readonly destination: Rectangle | undefined;
}

/**
 * The whole of a monitor as a region.
 *
 * @param monitor - The monitor's size.
 * @returns The rectangle from the monitor's top left.
 */
export function wholeOf(monitor: Size) {
  return {
    x: 0,
    y: 0,
    width: monitor.width,
    height: monitor.height
  } satisfies Rectangle;
}

/** The most width and height a picture may have; a side left out is not limited. */
export interface SizeLimits {
  readonly width?: number | undefined;
  readonly height?: number | undefined;
}

/**
 * The size of a picture shrunk until it fits inside the limits, keeping its
 * proportions. It never enlarges.
 *
 * @param options - The picture's size and the limits.
 * @returns The size; at least one pixel each way.
 */
export function fitWithin({ size, limits }: {
  readonly size: Size;
  readonly limits: SizeLimits;
}) {
  const ratio = Math.min(1, (limits.width ?? Infinity) / size.width, (limits.height ?? Infinity) / size.height);
  const isWithin = ratio === 1;
  if (isWithin) {
    return {
      width: size.width,
      height: size.height
    } satisfies Size;
  }

  return {
    width: Math.max(1, Math.round(size.width * ratio)),
    height: Math.max(1, Math.round(size.height * ratio))
  } satisfies Size;
}

/**
 * The rectangle two rectangles share, whose width or height is below 0 when
 * they are apart.
 *
 * @param options - The two rectangles.
 * @returns The shared rectangle, not yet checked for being empty.
 */
export function sharedRectangle({ first, second }: {
  readonly first: Rectangle;
  readonly second: Rectangle;
}) {
  const left = Math.max(first.x, second.x);
  const top = Math.max(first.y, second.y);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const bottom = Math.min(first.y + first.height, second.y + second.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  } satisfies Rectangle;
}

/**
 * The part of a rectangle that lies inside another.
 *
 * @param options - The two rectangles.
 * @returns The overlap; undefined when they do not overlap.
 */
export function overlapOf({ first, second }: {
  readonly first: Rectangle;
  readonly second: Rectangle;
}) {
  const shared = sharedRectangle({
    first,
    second
  });
  const isEmpty = shared.width <= 0 || shared.height <= 0;
  if (isEmpty) {
    return undefined;
  }

  return shared;
}

/**
 * Which part of the monitor to copy, and where it goes in a picture that the
 * region is stretched over: the region is not clipped to the monitor, so what
 * lies outside it is a blank part of the picture.
 *
 * @param options - The monitor, the region and the output size.
 * @returns The source and destination rectangles.
 */
export function capturePlan({ surface, region, output }: CapturePlanOptions) {
  const source = overlapOf({
    first: wholeOf(surface),
    second: region
  });
  const isOffMonitor = source === undefined;
  if (isOffMonitor) {
    return {
      source: undefined,
      destination: undefined
    } satisfies CapturePlan;
  }

  const scaleX = output.width / region.width;
  const scaleY = output.height / region.height;
  return {
    source,
    destination: {
      x: (source.x - region.x) * scaleX,
      y: (source.y - region.y) * scaleY,
      width: source.width * scaleX,
      height: source.height * scaleY
    }
  } satisfies CapturePlan;
}
