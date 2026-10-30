import { enumMap, ignored, keywordProperty, setter } from "./property-kit.ts";
import type { GroupInput, PropertyGroup } from "./property-kit.ts";
import { parseNumber } from "#src/css/parse/values.js";

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

/**
 * `line-clamp` (and `-webkit-line-clamp`): a number of lines, or `none`. It sets
 * MaxLines, and wraps the text and trims with an ellipsis as the clamp implies;
 * `text-wrap` and `text-overflow` win where they are written too.
 */
function lineClamp(input: GroupInput) {
  const member = input.computed.has("line-clamp") ? "line-clamp" : "-webkit-line-clamp";
  const reader = input.reading(member);
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return [];
  }

  const isNone = word.toLowerCase() === "none";
  if (isNone) {
    return [setter({
      property: "MaxLines",
      value: "0"
    })];
  }

  const lines = parseNumber(word);
  const isCount = lines !== null && Number.isInteger(lines) && lines > 0;
  if (!isCount) {
    reader.expectedToken({
      what: "none or a whole number of lines",
      token: word
    });
    return [];
  }

  return [
    setter({
      property: "TextWrapping",
      value: "Wrap"
    }),
    setter({
      property: "TextTrimming",
      value: "CharacterEllipsis"
    }),
    setter({
      property: "MaxLines",
      value: String(lines)
    })
  ];
}

/** `object-fit`, as an image's Stretch. */
const objectFits = enumMap([
  ["fill", "Fill"],
  ["contain", "Uniform"],
  ["cover", "UniformToFill"],
  ["none", "None"]
]);

/** `box-sizing`: a WinUI Width and Height include padding and border, so border-box is the only kind. */
function boxSizing(input: GroupInput) {
  const reader = input.reading("box-sizing");
  const word = reader.single()?.toLowerCase();
  const isContentBox = word === "content-box";
  if (isContentBox) {
    reader.error("box-sizing: content-box has no WinUI meaning (a WinUI Width and Height include the padding and border, as border-box does; add the padding to the width)");
  }

  return [];
}

const WORD_BREAK = "word-break";
const USER_SELECT = "user-select";
const BOX_SIZING = "box-sizing";
const OBJECT_FIT = "object-fit";
const CURSOR = "cursor";
const LINE_CLAMP = ["line-clamp", "-webkit-line-clamp"];

/** The properties of browser stylesheets that WinUI has a plain counterpart or no-op for. */
export const COMPAT_MEMBERS = [WORD_BREAK, USER_SELECT, OBJECT_FIT, CURSOR, BOX_SIZING, ...LINE_CLAMP];

/**
 * `word-break`, `user-select`, `object-fit`, `cursor` (ignored), `line-clamp` and `box-sizing`, which a stylesheet
 * written for browsers carries. They come before the built-in groups, so
 * `text-wrap` and `text-overflow` win where they are written too.
 */
export function compatGroups() {
  return [
    {
      members: [BOX_SIZING],
      lower: boxSizing
    },
    {
      members: LINE_CLAMP,
      lower: lineClamp
    },
    keywordProperty({
      member: WORD_BREAK,
      property: "TextWrapping",
      choices: wordBreaks
    }),
    ignored({
      member: CURSOR,
      why: "WinUI sets a cursor through the protected UIElement.ProtectedCursor and an InputSystemCursor, neither of which the bindings expose"
    }),
    keywordProperty({
      member: OBJECT_FIT,
      property: "Stretch",
      choices: objectFits
    }),
    keywordProperty({
      member: USER_SELECT,
      property: "IsTextSelectionEnabled",
      choices: textSelections
    })
  ].map(group => ({
    ...group,
    isFallback: true
  } satisfies PropertyGroup));
}
