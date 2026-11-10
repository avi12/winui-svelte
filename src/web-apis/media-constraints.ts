/** A number constraint: a value (an ideal) or the four bounds. */
export type ConstrainNumber = number | {
  readonly min?: number;
  readonly max?: number;
  readonly ideal?: number;
  readonly exact?: number;
};

/** A text constraint: a value (an ideal), a list or the two forms. */
export type ConstrainText = string | readonly string[] | {
  readonly exact?: string | readonly string[];
  readonly ideal?: string | readonly string[];
};

/** What Windows adds to the video constraints; a browser ignores every member. */
export interface VideoConstraintExtras {
  /** A capture profile of the camera (`MediaCaptureVideoProfile.id`), which fixes the formats it offers together. */
  readonly profileId?: string;
}

/** The constraints one track is asked for. */
export interface MediaTrackConstraintSet {
  readonly width?: ConstrainNumber;
  readonly height?: ConstrainNumber;
  readonly frameRate?: ConstrainNumber;
  readonly aspectRatio?: ConstrainNumber;
  readonly facingMode?: ConstrainText;
  readonly deviceId?: ConstrainText;
  readonly groupId?: ConstrainText;
}

/** The constraints of a track, with the extras. */
export interface MediaTrackConstraints extends MediaTrackConstraintSet, VideoConstraintExtras {
  readonly advanced?: readonly MediaTrackConstraintSet[];
}

/** The bounds a number constraint comes to. */
interface NumberBounds {
  readonly min?: number;
  readonly max?: number;
  readonly ideal?: number;
  readonly exact?: number;
}

/** The values a text constraint comes to. */
interface TextWishes {
  readonly exact: readonly string[];
  readonly ideal: readonly string[];
}

/** A format a camera offers. */
export interface VideoMode {
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
}

const DEFAULT_WIDTH = 640;
const DEFAULT_HEIGHT = 480;
const DEFAULT_FRAME_RATE = 30;
const MODE_KEYS = ["width", "height", "frameRate"] as const;
const defaults = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  frameRate: DEFAULT_FRAME_RATE
} satisfies VideoMode;

/** Turns a number constraint into its bounds; a plain number is an ideal. */
export function boundsOf(constraint: ConstrainNumber | undefined) {
  const isIdeal = typeof constraint === "number";
  if (isIdeal) {
    return { ideal: constraint } satisfies NumberBounds;
  }

  return constraint ?? {};
}

function listOf(value: string | readonly string[] | undefined) {
  const isMissingValue = value === undefined;
  if (isMissingValue) {
    return [];
  }

  return typeof value === "string" ? [value] : value;
}

/** Turns a text constraint into the values it requires and prefers. */
export function wishesOf(constraint: ConstrainText | undefined) {
  const isList = typeof constraint === "string" || Array.isArray(constraint);
  if (isList) {
    return {
      exact: [],
      ideal: listOf(constraint)
    } satisfies TextWishes;
  }

  const wishes = constraint ?? {};
  return {
    exact: listOf("exact" in wishes ? wishes.exact : undefined),
    ideal: listOf("ideal" in wishes ? wishes.ideal : undefined)
  } satisfies TextWishes;
}

function fitsBounds({ value, bounds }: {
  value: number;
  bounds: NumberBounds;
}) {
  const isExact = bounds.exact === undefined || value === bounds.exact;
  const isAboveMinimum = bounds.min === undefined || value >= bounds.min;
  const isBelowMaximum = bounds.max === undefined || value <= bounds.max;
  return isExact && isAboveMinimum && isBelowMaximum;
}

function distanceToIdeal({ value, ideal }: {
  value: number;
  ideal: number;
}) {
  return Math.abs(value - ideal) / Math.max(Math.abs(value), Math.abs(ideal), 1);
}

/**
 * Whether a camera format meets every exact, minimum and maximum of the
 * constraints.
 */
function isModeAllowed({ mode, constraints }: {
  mode: VideoMode;
  constraints: MediaTrackConstraintSet;
}) {
  return MODE_KEYS.every(key => fitsBounds({
    value: mode[key],
    bounds: boundsOf(constraints[key])
  }));
}

/**
 * The first of width, height and frame rate that no format meets alone, for
 * the `constraint` of an `OverconstrainedError`; `width` when each is met by
 * some format but none meets them together.
 */
export function blockingConstraint({ modes, constraints }: {
  modes: readonly VideoMode[];
  constraints: MediaTrackConstraintSet;
}) {
  const blocking = MODE_KEYS.find(key => !modes.some(mode => fitsBounds({
    value: mode[key],
    bounds: boundsOf(constraints[key])
  })));
  return blocking ?? "width";
}

function scoreOf({ mode, constraints }: {
  mode: VideoMode;
  constraints: MediaTrackConstraintSet;
}) {
  let score = 0;
  for (const key of MODE_KEYS) {
    const bounds = boundsOf(constraints[key]);
    score += distanceToIdeal({
      value: mode[key],
      ideal: bounds.ideal ?? bounds.exact ?? defaults[key]
    });
  }

  return score;
}

/**
 * Picks the format that meets the constraints and is nearest their ideals
 * (640 by 480 at 30 frames a second where none is given).
 *
 * @returns The format, or `undefined` when none meets the constraints.
 */
export function nearestMode({ modes, constraints }: {
  modes: readonly VideoMode[];
  constraints: MediaTrackConstraintSet;
}) {
  const allowed = modes.filter(mode => isModeAllowed({
    mode,
    constraints
  }));
  const scored = allowed.map(mode => ({
    mode,
    score: scoreOf({
      mode,
      constraints
    })
  }));
  scored.sort((first, second) => first.score - second.score);
  return scored[0]?.mode;
}

/** The standard `getSupportedConstraints()` for what Windows can honor. */
export function supportedConstraints() {
  return {
    width: true,
    height: true,
    frameRate: true,
    facingMode: true,
    deviceId: true,
    groupId: true,
    aspectRatio: false
  };
}
