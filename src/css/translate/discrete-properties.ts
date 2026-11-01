import { DISPLAY_KEYWORDS, flexDirections } from "./layout-properties.ts";
import { enumMap, keywordProperty } from "./property-kit.ts";
import {
  fontStyles,
  textAlignments,
  textDecorations,
  textOverflows,
  whiteSpaceKeywords,
  wrapKeywords
} from "./text-properties.ts";
import { colorSchemes, hitTesting, visibilities } from "./visual-properties.ts";

/** The Visibility values a `display` or `visibility` track steps between. */
export const VISIBLE = "Visible";

/** The Visibility of an element that takes no space. */
export const COLLAPSED = "Collapsed";

/** The WinUI property `display` and `visibility` both drive, the one whose visible value holds through an interval. */
export const VISIBILITY_PROPERTY = "Visibility";

const DISPLAY = "display";

/** `word-break`: WinUI breaks inside a word only when it is wider than the line. */
const wordBreaks = enumMap([
  ["normal", "WrapWholeWords"],
  ["keep-all", "WrapWholeWords"],
  ["break-all", "Wrap"],
  ["break-word", "Wrap"]
]);

/** `user-select`, as IsTextSelectionEnabled. */
const textSelections = enumMap([
  ["auto", "True"],
  ["text", "True"],
  ["all", "True"],
  ["contain", "True"],
  ["none", "False"]
]);

/** `object-fit`, as an image's Stretch. */
const objectFits = enumMap([
  ["fill", "Fill"],
  ["contain", "Uniform"],
  ["cover", "UniformToFill"],
  ["none", "None"]
]);

// Each CSS property of a fixed set of keywords: the WinUI property it sets and the value of each keyword.
const DISCRETE_PROPERTIES = new Map<string, {
  property: string;
  choices: ReadonlyMap<string, string>;
}>([
  // The properties of browser stylesheets come first: where two set one WinUI property, the later one wins.
  ["word-break", {
    property: "TextWrapping",
    choices: wordBreaks
  }],
  ["object-fit", {
    property: "Stretch",
    choices: objectFits
  }],
  ["user-select", {
    property: "IsTextSelectionEnabled",
    choices: textSelections
  }],
  ["font-style", {
    property: "FontStyle",
    choices: fontStyles
  }],
  ["text-align", {
    property: "TextAlignment",
    choices: textAlignments
  }],
  ["text-wrap", {
    property: "TextWrapping",
    choices: wrapKeywords
  }],
  ["white-space", {
    property: "TextWrapping",
    choices: whiteSpaceKeywords
  }],
  ["text-overflow", {
    property: "TextTrimming",
    choices: textOverflows
  }],
  ["text-decoration", {
    property: "TextDecorations",
    choices: textDecorations
  }],
  ["text-decoration-line", {
    property: "TextDecorations",
    choices: textDecorations
  }],
  ["flex-direction", {
    property: "Orientation",
    choices: flexDirections
  }],
  ["visibility", {
    property: VISIBILITY_PROPERTY,
    choices: visibilities
  }],
  ["pointer-events", {
    property: "IsHitTestVisible",
    choices: hitTesting
  }],
  ["color-scheme", {
    property: "RequestedTheme",
    choices: colorSchemes
  }]
]);

/** Every CSS property that steps between keywords when animated: the table's, and `display`. */
export const DISCRETE_MEMBERS = [...DISCRETE_PROPERTIES.keys(), DISPLAY];

/** The WinUI properties a discrete CSS property sets, each once. */
export const DISCRETE_WINUI_PROPERTIES = [...new Set([...DISCRETE_PROPERTIES.values()].map(spec => spec.property))];

/** The group of a keyword property of `DISCRETE_PROPERTIES`. */
export function discreteGroup(member: string) {
  const spec = DISCRETE_PROPERTIES.get(member);
  const isUnknown = spec === undefined;
  if (isUnknown) {
    throw new Error(`${member} is not a keyword property`);
  }

  return keywordProperty({
    member,
    ...spec
  });
}

/** The WinUI property a discrete CSS property sets: `display` and `visibility` share Visibility. */
export function discretePropertyOf(member: string) {
  return member === DISPLAY ? VISIBILITY_PROPERTY : DISCRETE_PROPERTIES.get(member)?.property;
}

/** The keywords a discrete CSS property takes. */
export function discreteWordsOf(member: string) {
  const words = member === DISPLAY ? DISPLAY_KEYWORDS : DISCRETE_PROPERTIES.get(member)?.choices.keys();
  return [...words ?? []];
}

/** The WinUI value a keyword of a discrete CSS property stands for, or undefined for a word it does not take. */
export function discreteValueOf({ member, word }: {
  member: string;
  word: string;
}) {
  const lower = word.trim().toLowerCase();
  const isDisplay = member === DISPLAY;
  if (!isDisplay) {
    return DISCRETE_PROPERTIES.get(member)?.choices.get(lower);
  }

  const isKnown = DISPLAY_KEYWORDS.has(lower);
  if (!isKnown) {
    return undefined;
  }

  return lower === "none" ? COLLAPSED : VISIBLE;
}
