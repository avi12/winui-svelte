import {
  parseDegrees,
  parseLength,
  parseNumber,
  parsePercent,
  splitCommas,
  splitWords
} from "#src/css/parse/values.js";
import { camelCase } from "#src/renderer/tree/markup.js";

// A transition's `css(t, u)` is CSS text, and Web Animations takes it as
// keyframes: objects of declarations in camelCase (`opacity`, `transform`,
// `translate`, `scale`, `rotate`). WinUI moves an element by four properties
// (Opacity, Translation, Scale, Rotation), so a keyframe is read into a pose
// of those, with the CSS value parsers the stylesheets use.

const MAX_AXES = 3;
const FUNCTION_PATTERN = /([a-z0-9]+)\(([^)]*)\)/giu;
const NO_TRANSFORM = "none";
// Reserved keys of a Web Animations keyframe, which are not CSS properties.
const RESERVED_KEYS = new Set(["offset", "easing", "composite"]);
// A declaration Svelte adds only to work around a browser, which WinUI needs not.
const IGNORED_PROPERTIES = new Set(["overflow"]);

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
  ROTATION: "rotation"
} as const;

/**
 * The values of the fields a keyframe sets: opacity from 0 to 1, translation in
 * pixels, scale as factors and rotation in degrees.
 */
export interface Pose {
  opacity?: number;
  translation?: Vector;
  scale?: Vector;
  rotation?: number;
}

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
// does for the functions Svelte writes.
function compose({ pose, next }: {
  pose: Pose;
  next: Pose;
}) {
  const { opacity, translation, scale, rotation } = next;
  const isOpacitySet = opacity !== undefined;
  if (isOpacitySet) {
    pose.opacity = opacity;
  }

  const isTranslationSet = translation !== undefined;
  if (isTranslationSet) {
    pose.translation = pose.translation === undefined ? translation : addVectors({
      first: pose.translation,
      second: translation
    });
  }

  const isScaleSet = scale !== undefined;
  if (isScaleSet) {
    pose.scale = pose.scale === undefined ? scale : multiplyVectors({
      first: pose.scale,
      second: scale
    });
  }

  const isRotationSet = rotation !== undefined;
  if (isRotationSet) {
    pose.rotation = (pose.rotation ?? 0) + rotation;
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

// By the property's camelCase name, from its value.
const propertyReaders = new Map<string, (text: string) => Pose | null>([
  ["opacity", opacityOf],
  ["transform", transformOf],
  ["translate", text => translationOf(splitWords(text))],
  ["scale", text => scaleOf(splitWords(text))],
  ["rotate", text => rotationOf(splitWords(text))]
]);

/**
 * Reads the declarations of a transition's `css(t, u)` ("opacity: 0.5; transform: translate(0px, 4px)")
 * into a keyframe, with the properties in camelCase as Web Animations has them.
 *
 * @param css - The declarations, separated by semicolons.
 * @returns The keyframe.
 */
export function readDeclarations(css: string) {
  const keyframe: Keyframe = {};
  for (const declaration of css.split(";")) {
    const iColon = declaration.indexOf(":");
    const isDeclaration = iColon > 0;
    if (isDeclaration) {
      keyframe[camelCase(declaration.slice(0, iColon).trim())] = declaration.slice(iColon + 1).trim();
    }
  }

  return keyframe;
}

/**
 * Reads a Web Animations keyframe into a pose of what WinUI animates.
 * `transform` (its `translate`, `scale` and `rotate` functions), `translate`,
 * `scale`, `rotate` and `opacity` are read; any other property, and a value
 * that cannot be read, is named in `unsupported`.
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
  const fields = new Set<string>();
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

interface Mixer<Value> {
  from: Value;
  to: Value;
  fraction: number;
}

// A field one of the two keyframes lacks holds the value of the other.
function between<Value>({ from, to, fraction, mix }: {
  from: Value | undefined;
  to: Value | undefined;
  fraction: number;
  mix: (mixer: Mixer<Value>) => Value;
}) {
  const isMixable = from !== undefined && to !== undefined;
  return isMixable ? mix({
    from,
    to,
    fraction
  }) : to ?? from;
}

function blend({ from, to, fraction }: Mixer<Pose>) {
  const pose: Pose = {};
  const opacity = between({
    from: from.opacity,
    to: to.opacity,
    fraction,
    mix: lerp
  });
  const translation = between({
    from: from.translation,
    to: to.translation,
    fraction,
    mix: lerpVector
  });
  const scale = between({
    from: from.scale,
    to: to.scale,
    fraction,
    mix: lerpVector
  });
  const rotation = between({
    from: from.rotation,
    to: to.rotation,
    fraction,
    mix: lerp
  });
  const isOpacityKnown = opacity !== undefined;
  if (isOpacityKnown) {
    pose.opacity = opacity;
  }

  const isTranslationKnown = translation !== undefined;
  if (isTranslationKnown) {
    pose.translation = translation;
  }

  const isScaleKnown = scale !== undefined;
  if (isScaleKnown) {
    pose.scale = scale;
  }

  const isRotationKnown = rotation !== undefined;
  if (isRotationKnown) {
    pose.rotation = rotation;
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
