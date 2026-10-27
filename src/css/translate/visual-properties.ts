import { enumMap } from "./property-kit.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseNumber, parsePercent } from "#src/css/parse/values.js";

/** `visibility`. */
export const visibilities = enumMap([
  ["visible", "Visible"],
  ["hidden", "Collapsed"],
  ["collapse", "Collapsed"]
]);

/** `pointer-events`, as IsHitTestVisible. */
export const hitTesting = enumMap([
  ["none", "False"],
  ["auto", "True"],
  ["all", "True"]
]);

/** `opacity`: a number or a percentage from 0 to 1. */
export function opacity(reader: Reader) {
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return null;
  }

  const amount = parseNumber(word) ?? parsePercent(word);
  const isInRange = amount !== null && amount >= 0 && amount <= 1;
  return isInRange ? String(amount) : reader.expectedToken({
    what: "a number or percentage from 0 to 1",
    token: word
  });
}

/** `z-index`: an integer, as Canvas.ZIndex. */
export function zIndex(reader: Reader) {
  const value = parseNumber(reader.single() ?? "");
  const isInteger = value !== null && Number.isInteger(value);
  return isInteger ? String(value) : reader.expected("an integer");
}
