import type { WindowBounds } from "./anchor.ts";
import { WindowPresentation } from "./chrome.ts";

/**
 * Whether a window was normal, maximized or minimized when its place was
 * saved; the saved bounds are always the normal ones.
 */
export const WindowRestoreState = {
  normal: "normal",
  maximized: "maximized",
  minimized: "minimized"
} as const;

/** One of `WindowRestoreState`'s values. */
export type WindowRestoreState = (typeof WindowRestoreState)[keyof typeof WindowRestoreState];

/** What is kept of a window between runs. */
export interface SavedWindowState {
  /** The normal (not maximized, not minimized) bounds in device pixels. */
  bounds: WindowBounds;

  /** Device pixels per device-independent pixel when it was saved. */
  scale: number;
  state: WindowRestoreState;
  presentation: WindowPresentation;
}

const MINIMUM_SIDE = 1;

/**
 * The bounds as they are at another scale: the size follows the scale (the
 * window keeps its size in device-independent pixels), the position stays
 * where it is on the desktop.
 */
export function rescaledBounds({ bounds, from, to }: {
  bounds: WindowBounds;
  from: number;
  to: number;
}) {
  const ratio = to / from;
  return {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(MINIMUM_SIDE, Math.round(bounds.width * ratio)),
    height: Math.max(MINIMUM_SIDE, Math.round(bounds.height * ratio))
  };
}

function insideSide({ start, length, areaStart, areaLength }: {
  start: number;
  length: number;
  areaStart: number;
  areaLength: number;
}) {
  const fitted = Math.min(length, areaLength);
  const latest = areaStart + areaLength - fitted;
  return {
    start: Math.min(Math.max(start, areaStart), latest),
    length: fitted
  };
}

/**
 * The bounds moved, and shrunk when they must be, to lie inside `area` (a
 * display's work area): a window left on a display that is gone, or on one
 * that got smaller, comes back whole.
 */
export function clampedBounds({ bounds, area }: {
  bounds: WindowBounds;
  area: WindowBounds;
}) {
  const horizontal = insideSide({
    start: bounds.x,
    length: bounds.width,
    areaStart: area.x,
    areaLength: area.width
  });
  const vertical = insideSide({
    start: bounds.y,
    length: bounds.height,
    areaStart: area.y,
    areaLength: area.height
  });
  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.length,
    height: vertical.length
  };
}

/**
 * Where a saved window opens now: its size at the scale it has now, inside
 * the work area `area` of the display nearest to it.
 */
export function restoredBounds({ saved, scale, area }: {
  saved: SavedWindowState;
  scale: number;
  area: WindowBounds;
}) {
  return clampedBounds({
    bounds: rescaledBounds({
      bounds: saved.bounds,
      from: saved.scale,
      to: scale
    }),
    area
  });
}

/** The text a `SavedWindowState` is kept as. */
export function serializeWindowState(saved: SavedWindowState) {
  return JSON.stringify(saved);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function integerOf(value: unknown) {
  const isInteger = typeof value === "number" && Number.isInteger(value);
  return isInteger ? value : undefined;
}

function sideOf(value: unknown) {
  const side = integerOf(value);
  const isSide = side !== undefined && side >= MINIMUM_SIDE;
  return isSide ? side : undefined;
}

function scaleOf(value: unknown) {
  const isScale = typeof value === "number" && Number.isFinite(value) && value > 0;
  return isScale ? value : undefined;
}

function memberOf<Member extends string>({ members, value }: {
  members: Record<string, Member>;
  value: unknown;
}) {
  return Object.values(members).find(member => member === value);
}

function boundsOf(value: unknown) {
  if (!isObject(value)) {
    return undefined;
  }

  const x = integerOf(value["x"]);
  const y = integerOf(value["y"]);
  const width = sideOf(value["width"]);
  const height = sideOf(value["height"]);
  const isComplete = x !== undefined && y !== undefined && width !== undefined && height !== undefined;
  if (!isComplete) {
    return undefined;
  }

  return {
    x,
    y,
    width,
    height
  };
}

/**
 * What `text` holds, or null when it is missing, corrupt or from a version
 * that kept something else: the window then opens as its props say.
 */
export function parseWindowState(text: string | undefined) {
  const isMissing = text === undefined;
  if (isMissing) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (!isObject(parsed)) {
    return null;
  }

  const bounds = boundsOf(parsed["bounds"]);
  const scale = scaleOf(parsed["scale"]);
  const state = memberOf({
    members: WindowRestoreState,
    value: parsed["state"]
  });
  const presentation = memberOf({
    members: WindowPresentation,
    value: parsed["presentation"]
  });
  const isComplete = bounds !== undefined && scale !== undefined && state !== undefined && presentation !== undefined;
  if (!isComplete) {
    return null;
  }

  return {
    bounds,
    scale,
    state,
    presentation
  } satisfies SavedWindowState;
}
