import { setter } from "./property-kit.ts";
import { parseDegrees } from "#src/css/parse/angles.js";
import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parseNumber } from "#src/css/parse/values.js";

const MAX_TRANSLATION_AXES = 3;

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
