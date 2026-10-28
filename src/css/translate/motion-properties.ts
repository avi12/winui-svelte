import { setter } from "./property-kit.ts";
import type { GroupInput, Output } from "./property-kit.ts";
import { DEFAULT_ORIGIN, parseTransformOrigin } from "./transform-origin.ts";
import type { Reader } from "#src/css/parse/reader.js";
import {
  parseLength,
  parseMilliseconds,
  parseNumber,
  splitCommas,
  splitWords
} from "#src/css/parse/values.js";

const MILLISECONDS_PER_SECOND = 1000;
const DURATION_FRACTION_DIGITS = 3;
const MAX_TRANSLATION_AXES = 3;

/** WinUI animates these properties by an implicit transition set on them. */
const TRANSITION_TARGETS = new Map<string, Array<[string, string]>>([
  ["opacity", [["OpacityTransition", "ScalarTransition"]]],
  ["translate", [["TranslationTransition", "Vector3Transition"]]],
  ["scale", [["ScaleTransition", "Vector3Transition"]]],
  ["rotate", [["RotationTransition", "ScalarTransition"]]],
  ["background", [["BackgroundTransition", "BrushTransition"]]],
  ["background-color", [["BackgroundTransition", "BrushTransition"]]],
  ["all", [
    ["OpacityTransition", "ScalarTransition"],
    ["TranslationTransition", "Vector3Transition"],
    ["ScaleTransition", "Vector3Transition"],
    ["RotationTransition", "ScalarTransition"]
  ]]
]);

/** `translate`: one to three lengths, as WinUI's Translation. */
export function translation(reader: Reader) {
  const words = reader.words;
  const [first, second = "0", third = "0"] = words;
  const lengths = [first, second, third].map(word => (word === undefined ? null : parseLength(word)));
  const isValid = words.length >= 1 && words.length <= MAX_TRANSLATION_AXES && !lengths.includes(null);
  if (!isValid) {
    reader.expected("one to three lengths");
    return [];
  }

  return [setter({
    property: "Translation",
    value: lengths.join(",")
  })];
}

/** `scale`: one to three factors, as WinUI's Scale. */
export function scaling(reader: Reader) {
  const [first, second = first, third = "1"] = reader.words;
  const factors = [first, second, third].map(word => (word === undefined ? null : parseNumber(word)));
  if (factors.includes(null)) {
    reader.expected("one to three numbers");
    return [];
  }

  return [setter({
    property: "Scale",
    value: factors.join(",")
  })];
}

/** `rotate`: an angle in deg, as WinUI's Rotation. */
export function rotation(reader: Reader) {
  const word = reader.single() ?? "";
  const match = /^(-?\d*\.?\d+)deg$/iu.exec(word);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    reader.expectedToken({
      what: "an angle in deg",
      token: word
    });
    return [];
  }

  return [setter({
    property: "Rotation",
    value: String(Number(match[1]))
  })];
}

function duration(milliseconds: number) {
  const seconds = (milliseconds / MILLISECONDS_PER_SECOND).toFixed(DURATION_FRACTION_DIGITS);
  return `0:0:${seconds}`;
}

/** `transition`: the implicit transition WinUI sets on each animatable property named. */
export function transition(input: GroupInput) {
  const reader = input.reading("transition");
  const outputs: Output[] = [];
  for (const entry of splitCommas(reader.declaration.value)) {
    const [property = "", time, ...rest] = splitWords(entry);
    const milliseconds = time === undefined ? null : parseMilliseconds(time);
    const targets = TRANSITION_TARGETS.get(property.toLowerCase());
    const isTargetsMissing = targets === undefined;
    if (isTargetsMissing) {
      reader.warn(`transition: ${property} cannot be animated (WinUI animates opacity, translate, scale, rotate and background); ignored`);
      continue;
    }

    const isMillisecondsMissing = milliseconds === null;
    if (isMillisecondsMissing) {
      reader.expectedToken({
        what: "`property duration`",
        token: entry
      });
      continue;
    }

    const hasRestItems = rest.length > 0;
    if (hasRestItems) {
      reader.warn(`transition: "${rest.join(" ")}" ignored (WinUI's implicit transitions take a duration only)`);
    }

    for (const [name, type] of targets) {
      outputs.push({
        kind: "content",
        property: name,
        xaml: `<${type} Duration="${duration(milliseconds)}"/>`
      });
    }
  }

  return outputs;
}

const ORIGIN_MEMBER = "transform-origin";
const PIVOTING_MEMBERS = ["scale", "rotate"] as const;

/**
 * `transform-origin`, which WinUI's Scale and Rotation need as an absolute
 * CenterPoint (default 0,0, the top-left corner, where CSS pivots at the
 * centre). Written for any element that scales or rotates, at CSS's default
 * 50% 50% unless it names another; the runtime resolves it against the
 * element's size.
 */
export function transformOrigin(input: GroupInput) {
  const isPivoting = PIVOTING_MEMBERS.some(member => input.computed.has(member));
  const reader = input.readers.get(ORIGIN_MEMBER);
  const isOriginDefault = reader === undefined;
  if (isOriginDefault) {
    return isPivoting ? [{
      kind: "write",
      target: "origin",
      value: DEFAULT_ORIGIN
    } as const] : [];
  }

  const value = parseTransformOrigin(reader);
  return value === null ? [] : [{
    kind: "write",
    target: "origin",
    value
  } as const];
}

/** The members `transformOrigin` is lowered from. */
export const TRANSFORM_ORIGIN_MEMBERS = [ORIGIN_MEMBER, ...PIVOTING_MEMBERS];
