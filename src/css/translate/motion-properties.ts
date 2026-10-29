import { setter } from "./property-kit.ts";
import type { GroupInput, Output } from "./property-kit.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseDegrees } from "#src/css/parse/angles.js";
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
  const degrees = parseDegrees(word);
  const isDegreesMissing = degrees === null;
  if (isDegreesMissing) {
    reader.expectedToken({
      what: "an angle in deg",
      token: word
    });
    return [];
  }

  return [setter({
    property: "Rotation",
    value: String(degrees)
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
