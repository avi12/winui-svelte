import { parseDegrees } from "#src/css/parse/angles.js";
import {
  parseLength,
  parseNumber,
  parsePercent,
  splitCommas,
  splitWords
} from "#src/css/parse/values.js";

// A transition's `css(t, u)` is CSS text, and Web Animations takes it as
// keyframes: objects of declarations in camelCase (`opacity`, `transform`,
// `translate`, `scale`, `rotate`, `height`, `paddingTop`...). WinUI changes an
// element by the properties of a pose (Opacity, Translation, Scale, Rotation,
// the size, the margin, padding and border of each side, the stroke's dashes),
// so a keyframe is read into a pose of those, with the CSS value parsers the
// stylesheets use.

const MAX_AXES = 3;
const FUNCTION_PATTERN = /([a-z0-9]+)\(([^)]*)\)/giu;
const NO_TRANSFORM = "none";
const MAX_ORIGIN_WORDS = 2;
// Reserved keys of a Web Animations keyframe, which are not CSS properties.
const RESERVED_KEYS = new Set(["offset", "easing", "composite"]);
// A declaration Svelte adds only to work around a browser, which WinUI needs not.
const IGNORED_PROPERTIES = new Set(["overflow", "minHeight", "minWidth"]);

/** A WinUI Vector3, as the bindings pass it. */
export interface Vector {
  x: number;
  y: number;
  z: number;
}

/** The properties of an element that WinUI animates, as the bindings name them. */
export const PoseField = {
  OPACITY: "opacity",
  TRANSLATION: "translation",
  SCALE: "scale",
  ROTATION: "rotation",
  ORIGIN: "origin",
  WIDTH: "width",
  HEIGHT: "height",
  MARGIN_LEFT: "marginLeft",
  MARGIN_TOP: "marginTop",
  MARGIN_RIGHT: "marginRight",
  MARGIN_BOTTOM: "marginBottom",
  PADDING_LEFT: "paddingLeft",
  PADDING_TOP: "paddingTop",
  PADDING_RIGHT: "paddingRight",
  PADDING_BOTTOM: "paddingBottom",
  BORDER_LEFT: "borderLeft",
  BORDER_TOP: "borderTop",
  BORDER_RIGHT: "borderRight",
  BORDER_BOTTOM: "borderBottom",
  STROKE_DASH: "strokeDash",
  STROKE_DASH_OFFSET: "strokeDashOffset",
  BLUR: "blur"
} as const;

/** A name in `PoseField`. */
export type PoseField = typeof PoseField[keyof typeof PoseField];

/** What a field holds: a number, or a vector for the fields that have an x and a y. */
export type PoseValue = number | Vector;

/**
 * The values of the fields a keyframe sets: opacity from 0 to 1, translation
 * and sizes in pixels, scale as factors, rotation in degrees, the origin of
 * scale and rotation as fractions of the size, the dashes as lengths in pixels,
 * the blur as a standard deviation in pixels.
 */
export type Pose = Partial<Record<PoseField, PoseValue>>;

/** A Web Animations keyframe: CSS declarations by camelCase property. */
export type Keyframe = Record<string, string | number | null | undefined>;

function addVectors({ first, second }: {
  first: Vector;
  second: Vector;
}) {
  return {
    x: first.x + second.x,
    y: first.y + second.y,
    z: first.z + second.z
  };
}

function multiplyVectors({ first, second }: {
  first: Vector;
  second: Vector;
}) {
  return {
    x: first.x * second.x,
    y: first.y * second.y,
    z: first.z * second.z
  };
}

// Transforms compose in order; WinUI applies scale, then rotation, then
// translation about the center, which is what CSS's `translate scale rotate`
// does for the functions Svelte writes. Any other field takes the newest.
function combine({ field, previous, value }: {
  field: PoseField;
  previous: PoseValue | undefined;
  value: PoseValue;
}) {
  const isNumbers = typeof previous === "number" && typeof value === "number";
  if (isNumbers) {
    return field === PoseField.ROTATION ? previous + value : value;
  }

  const isVectors = typeof previous === "object" && typeof value === "object";
  if (!isVectors) {
    return value;
  }

  const isTranslation = field === PoseField.TRANSLATION;
  if (isTranslation) {
    return addVectors({
      first: previous,
      second: value
    });
  }

  return field === PoseField.SCALE ? multiplyVectors({
    first: previous,
    second: value
  }) : value;
}

function compose({ pose, next }: {
  pose: Pose;
  next: Pose;
}) {
  for (const field of Object.values(PoseField)) {
    const value = next[field];
    const isSet = value !== undefined;
    if (isSet) {
      pose[field] = combine({
        field,
        previous: pose[field],
        value
      });
    }
  }
}

// Every text read by the parser, or null when one is not a value of it.
function parseAll<Value>({ texts, parse }: {
  texts: string[];
  parse: (text: string) => Value | null;
}) {
  const values: Value[] = [];
  for (const text of texts) {
    const value = parse(text);
    const isUnreadable = value === null;
    if (isUnreadable) {
      return null;
    }

    values.push(value);
  }

  return values;
}

function translationOf(texts: string[]) {
  const isCountValid = texts.length >= 1 && texts.length <= MAX_AXES;
  const lengths = isCountValid ? parseAll({
    texts,
    parse: parseLength
  }) : null;
  const isLengthsMissing = lengths === null;
  if (isLengthsMissing) {
    return null;
  }

  const [x = 0, y = 0, depth = 0] = lengths;
  return {
    translation: {
      x,
      y,
      z: depth
    }
  } satisfies Pose;
}

function scaleOf(texts: string[]) {
  const isCountValid = texts.length >= 1 && texts.length <= MAX_AXES;
  const factors = isCountValid ? parseAll({
    texts,
    parse: parseNumber
  }) : null;
  const isFactorsMissing = factors === null;
  if (isFactorsMissing) {
    return null;
  }

  const [x = 1, y = x, depth = 1] = factors;
  return {
    scale: {
      x,
      y,
      z: depth
    }
  } satisfies Pose;
}

function axisOf({ texts, axis, parse }: {
  texts: string[];
  axis: "x" | "y";
  parse: (texts: string[]) => Pose | null;
}) {
  const isSingle = texts.length === 1;
  if (!isSingle) {
    return null;
  }

  const [text = ""] = texts;
  return parse(axis === "x" ? [text, "0"] : ["0", text]);
}

function rotationOf(texts: string[]) {
  const [text = ""] = texts;
  const degrees = texts.length === 1 ? parseDegrees(text) : null;
  return degrees === null ? null : { rotation: degrees } satisfies Pose;
}

function scaleAxisOf({ texts, axis }: {
  texts: string[];
  axis: "x" | "y";
}) {
  const [text = ""] = texts;
  const isSingle = texts.length === 1;
  const factor = isSingle ? parseNumber(text) : null;
  const isFactorMissing = factor === null;
  if (isFactorMissing) {
    return null;
  }

  return scaleOf(axis === "x" ? [text, "1"] : ["1", text]);
}

// By the function's lower-cased name, from its arguments.
const transformFunctions = new Map<string, (texts: string[]) => Pose | null>([
  ["translate", translationOf],
  ["translate3d", translationOf],
  ["translatex", texts => axisOf({
    texts,
    axis: "x",
    parse: translationOf
  })],
  ["translatey", texts => axisOf({
    texts,
    axis: "y",
    parse: translationOf
  })],
  ["scale", scaleOf],
  ["scalex", texts => scaleAxisOf({
    texts,
    axis: "x"
  })],
  ["scaley", texts => scaleAxisOf({
    texts,
    axis: "y"
  })],
  ["rotate", rotationOf],
  ["rotatez", rotationOf]
]);

function transformOf(text: string) {
  const isNone = text.trim() === NO_TRANSFORM;
  if (isNone) {
    return {};
  }

  const leftover = text.replace(FUNCTION_PATTERN, "").trim();
  const isOnlyFunctions = leftover === "";
  if (!isOnlyFunctions) {
    return null;
  }

  const pose: Pose = {};
  for (const [, name = "", argument = ""] of text.matchAll(FUNCTION_PATTERN)) {
    const next = transformFunctions.get(name.toLowerCase())?.(splitCommas(argument));
    const isUnreadable = next == null;
    if (isUnreadable) {
      return null;
    }

    compose({
      pose,
      next
    });
  }

  return pose;
}

function opacityOf(text: string) {
  const amount = parseNumber(text) ?? parsePercent(text);
  const isAmountMissing = amount === null;
  return isAmountMissing ? null : { opacity: Math.min(Math.max(amount, 0), 1) } satisfies Pose;
}

// A length, or a bare number as the transitions write one (dash lengths).
function lengthOf(text: string) {
  return parseLength(text) ?? parseNumber(text);
}

// A pose with one field, or null for a value that did not read.
function fieldOf({ field, value }: {
  field: PoseField;
  value: PoseValue | null;
}) {
  const isUnreadable = value === null;
  return isUnreadable ? null : { [field]: value } satisfies Pose;
}

function lengthReader(field: PoseField) {
  return (text: string) => fieldOf({
    field,
    value: lengthOf(text)
  });
}

// A size, a padding or a border cannot be negative; a margin can.
function extentReader(field: PoseField) {
  return (text: string) => {
    const length = lengthOf(text);
    return fieldOf({
      field,
      value: length === null ? null : Math.max(length, 0)
    });
  };
}

function dashOf(text: string) {
  const lengths = parseAll({
    texts: splitWords(text),
    parse: lengthOf
  });
  const [on, off = on] = lengths ?? [];
  const isReadable = on !== undefined && off !== undefined;
  return isReadable ? {
    strokeDash: {
      x: on,
      y: off,
      z: 0
    }
  } satisfies Pose : null;
}

const BLUR_FUNCTION = /^blur\((.*)\)$/iu;

// `filter: blur(4px)` (what Svelte's blur writes) or `none`: the standard deviation of the blur, in pixels.
function blurOf(text: string) {
  const word = text.trim().toLowerCase();
  const isNone = word === NO_TRANSFORM;
  if (isNone) {
    return { blur: 0 } satisfies Pose;
  }

  const radius = parseLength(BLUR_FUNCTION.exec(word)?.[1]?.trim() ?? "");
  const isRadius = radius !== null && radius >= 0;
  return isRadius ? { blur: radius } satisfies Pose : null;
}

const ORIGIN_CENTER = 0.5;
const ORIGIN_KEYWORDS = new Map([
  ["left", 0],
  ["top", 0],
  ["center", ORIGIN_CENTER],
  ["right", 1],
  ["bottom", 1]
]);
const VERTICAL_KEYWORDS = new Set(["top", "bottom"]);
const HORIZONTAL_KEYWORDS = new Set(["left", "right"]);

function originFraction(word: string) {
  return ORIGIN_KEYWORDS.get(word) ?? parsePercent(word) ?? parseNumber(word);
}

// `top left`, `0 0`, `50% 50%`: fractions of the element's size (a length in
// pixels has no meaning without it, so it is not read).
function originOf(text: string) {
  const words = splitWords(text.toLowerCase());
  const [first = "center", second = "center"] = words;
  const isSwapped = VERTICAL_KEYWORDS.has(first) || HORIZONTAL_KEYWORDS.has(second);
  const x = originFraction(isSwapped ? second : first);
  const y = originFraction(isSwapped ? first : second);
  const isReadable = x !== null && y !== null && words.length <= MAX_ORIGIN_WORDS;
  return isReadable ? {
    origin: {
      x,
      y,
      z: 0
    }
  } satisfies Pose : null;
}

// By the property's camelCase name, from its value.
const propertyReaders = new Map<string, (text: string) => Pose | null>([
  ["opacity", opacityOf],
  ["transform", transformOf],
  ["translate", text => translationOf(splitWords(text))],
  ["scale", text => scaleOf(splitWords(text))],
  ["rotate", text => rotationOf(splitWords(text))],
  ["transformOrigin", originOf],
  ["filter", blurOf],
  ["strokeDasharray", dashOf],
  ["strokeDashoffset", lengthReader(PoseField.STROKE_DASH_OFFSET)],
  ["width", extentReader(PoseField.WIDTH)],
  ["height", extentReader(PoseField.HEIGHT)],
  ["marginLeft", lengthReader(PoseField.MARGIN_LEFT)],
  ["marginTop", lengthReader(PoseField.MARGIN_TOP)],
  ["marginRight", lengthReader(PoseField.MARGIN_RIGHT)],
  ["marginBottom", lengthReader(PoseField.MARGIN_BOTTOM)],
  ["paddingLeft", extentReader(PoseField.PADDING_LEFT)],
  ["paddingTop", extentReader(PoseField.PADDING_TOP)],
  ["paddingRight", extentReader(PoseField.PADDING_RIGHT)],
  ["paddingBottom", extentReader(PoseField.PADDING_BOTTOM)],
  ["borderLeftWidth", extentReader(PoseField.BORDER_LEFT)],
  ["borderTopWidth", extentReader(PoseField.BORDER_TOP)],
  ["borderRightWidth", extentReader(PoseField.BORDER_RIGHT)],
  ["borderBottomWidth", extentReader(PoseField.BORDER_BOTTOM)]
]);

/**
 * Reads a Web Animations keyframe into a pose of what WinUI animates.
 * `transform` (its `translate`, `scale` and `rotate` functions), `translate`,
 * `scale`, `rotate`, `transform-origin`, `opacity`, the size, the margin,
 * padding and border width of each side, the stroke's dashes and `filter: blur()`
 * are read; any other property, and a value that cannot be read, is named in
 * `unsupported`.
 *
 * @param keyframe - One keyframe, as Svelte or Element.animate() gives it.
 * @returns The pose, and the unsupported property names.
 */
export function readKeyframe(keyframe: Keyframe) {
  const pose: Pose = {};
  const unsupported: string[] = [];
  for (const [property, value] of Object.entries(keyframe)) {
    const isSkipped = RESERVED_KEYS.has(property) || IGNORED_PROPERTIES.has(property) || value == null;
    if (isSkipped) {
      continue;
    }

    const next = propertyReaders.get(property)?.(String(value));
    const isUnreadable = next == null;
    if (isUnreadable) {
      unsupported.push(property);
      continue;
    }

    compose({
      pose,
      next
    });
  }

  return {
    pose,
    unsupported
  };
}

/**
 * The fields some pose sets.
 *
 * @param poses - The poses of an animation's keyframes.
 * @returns The fields to animate.
 */
export function touchedFields(poses: Pose[]) {
  const fields = new Set<PoseField>();
  for (const pose of poses) {
    for (const field of Object.values(PoseField)) {
      const isSet = pose[field] !== undefined;
      if (isSet) {
        fields.add(field);
      }
    }
  }

  return fields;
}

function lerp({ from, to, fraction }: {
  from: number;
  to: number;
  fraction: number;
}) {
  return from + (to - from) * fraction;
}

function lerpVector({ from, to, fraction }: {
  from: Vector;
  to: Vector;
  fraction: number;
}) {
  return {
    x: lerp({
      from: from.x,
      to: to.x,
      fraction
    }),
    y: lerp({
      from: from.y,
      to: to.y,
      fraction
    }),
    z: lerp({
      from: from.z,
      to: to.z,
      fraction
    })
  };
}

// A field one of the two keyframes lacks holds the value of the other.
function between({ from, to, fraction }: {
  from: PoseValue | undefined;
  to: PoseValue | undefined;
  fraction: number;
}) {
  const isNumbers = typeof from === "number" && typeof to === "number";
  if (isNumbers) {
    return lerp({
      from,
      to,
      fraction
    });
  }

  const isVectors = typeof from === "object" && typeof to === "object";
  return isVectors ? lerpVector({
    from,
    to,
    fraction
  }) : to ?? from;
}

function blend({ from, to, fraction }: {
  from: Pose;
  to: Pose;
  fraction: number;
}) {
  const pose: Pose = {};
  for (const field of Object.values(PoseField)) {
    const value = between({
      from: from[field],
      to: to[field],
      fraction
    });
    const isKnown = value !== undefined;
    if (isKnown) {
      pose[field] = value;
    }
  }

  return pose;
}

/**
 * The pose part-way through evenly spaced keyframes, as Web Animations places
 * keyframes with no offset, interpolated linearly (Svelte bakes its easing
 * into the keyframes it samples).
 *
 * @param options - The keyframes' poses, and how far through them: 0 is the first, 1 the last.
 * @returns The interpolated pose.
 */
export function poseAt({ poses, progress }: {
  poses: Pose[];
  progress: number;
}) {
  const lastIndex = poses.length - 1;
  const isEmpty = lastIndex < 0;
  if (isEmpty) {
    return {};
  }

  const position = Math.min(Math.max(progress, 0), 1) * lastIndex;
  const iFrom = Math.min(Math.floor(position), lastIndex);
  return blend({
    from: poses[iFrom] ?? {},
    to: poses[Math.min(iFrom + 1, lastIndex)] ?? {},
    fraction: position - iFrom
  });
}
