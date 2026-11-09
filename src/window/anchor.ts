/**
 * A corner of a window or of a display's work area. A window that changes
 * size keeps its anchor corner where it is; a window docked to an anchor sits
 * against that corner.
 */
export const WindowAnchor = {
  topLeft: "topLeft",
  topRight: "topRight",
  bottomLeft: "bottomLeft",
  bottomRight: "bottomRight"
} as const;

/** One of `WindowAnchor`'s values. */
export type WindowAnchor = (typeof WindowAnchor)[keyof typeof WindowAnchor];

/**
 * Which of a window's sides follow its content: the width, the height, both,
 * or neither (the window keeps the size its props and its user give it).
 */
export const SizeToContent = {
  none: "none",
  width: "width",
  height: "height",
  both: "both"
} as const;

/** One of `SizeToContent`'s values. */
export type SizeToContent = (typeof SizeToContent)[keyof typeof SizeToContent];

/** A position and a size in device pixels, as AppWindow and DisplayArea have them. */
export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A size in device pixels. */
export interface WindowSize {
  width: number;
  height: number;
}

/** The least and the most a window may be, in device pixels; `Infinity` is no most. */
export interface WindowLimits {
  minWidth: number;
  minHeight: number;
  maxWidth: number;
  maxHeight: number;
}

const ANCHOR_SIDES = {
  [WindowAnchor.topLeft]: {
    isRight: false,
    isBottom: false
  },
  [WindowAnchor.topRight]: {
    isRight: true,
    isBottom: false
  },
  [WindowAnchor.bottomLeft]: {
    isRight: false,
    isBottom: true
  },
  [WindowAnchor.bottomRight]: {
    isRight: true,
    isBottom: true
  }
} as const satisfies Record<WindowAnchor, {
  isRight: boolean;
  isBottom: boolean;
}>;

/**
 * The window `bounds` at `size` with its `anchor` corner where it was: a
 * window anchored bottom-right that grows taller grows upward.
 */
export function anchoredBounds({ bounds, size, anchor }: {
  bounds: WindowBounds;
  size: WindowSize;
  anchor: WindowAnchor;
}) {
  const { isRight, isBottom } = ANCHOR_SIDES[anchor];
  return {
    x: isRight ? bounds.x + bounds.width - size.width : bounds.x,
    y: isBottom ? bounds.y + bounds.height - size.height : bounds.y,
    width: size.width,
    height: size.height
  };
}

/**
 * Where a window of `size` sits against the `anchor` corner of `area` (a
 * display's work area), `inset` device pixels in from both of its edges.
 */
export function dockedBounds({ area, size, anchor, inset }: {
  area: WindowBounds;
  size: WindowSize;
  anchor: WindowAnchor;
  inset: number;
}) {
  const { isRight, isBottom } = ANCHOR_SIDES[anchor];
  return {
    x: isRight ? area.x + area.width - size.width - inset : area.x + inset,
    y: isBottom ? area.y + area.height - size.height - inset : area.y + inset,
    width: size.width,
    height: size.height
  };
}

/**
 * The bounds a window takes to cover `area` (a display's whole `outerBounds`)
 * or, with `region`, a rectangle given in the display's own pixels from its
 * top left. The region is not clipped to the display, so a frame drawn outside
 * a region at the display's edge still lands where it was asked for.
 */
export function coveredBounds({ area, region }: {
  area: WindowBounds;
  region?: WindowBounds | undefined;
}) {
  const isWholeDisplay = region === undefined;
  if (isWholeDisplay) {
    return {
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height
    };
  }

  return {
    x: area.x + region.x,
    y: area.y + region.y,
    width: region.width,
    height: region.height
  };
}

function clamp({ value, least, most }: {
  value: number;
  least: number;
  most: number;
}) {
  return Math.min(Math.max(value, least), most);
}

/**
 * The bounds a window sized to its content takes: the sides `mode` names go to
 * `desired` (what the content asks for, frame included) within `limits`, and
 * the `anchor` corner stays. null when the window is already that size, so a
 * caller makes no call for it.
 */
export function fittedBounds({ bounds, desired, mode, anchor, limits }: {
  bounds: WindowBounds;
  desired: WindowSize;
  mode: SizeToContent;
  anchor: WindowAnchor;
  limits: WindowLimits;
}) {
  const isWidthFitted = mode === SizeToContent.width || mode === SizeToContent.both;
  const isHeightFitted = mode === SizeToContent.height || mode === SizeToContent.both;
  const size = {
    width: isWidthFitted ? clamp({
      value: desired.width,
      least: limits.minWidth,
      most: limits.maxWidth
    }) : bounds.width,
    height: isHeightFitted ? clamp({
      value: desired.height,
      least: limits.minHeight,
      most: limits.maxHeight
    }) : bounds.height
  };
  const isUnchanged = size.width === bounds.width && size.height === bounds.height;
  if (isUnchanged) {
    return null;
  }

  return anchoredBounds({
    bounds,
    size,
    anchor
  });
}
