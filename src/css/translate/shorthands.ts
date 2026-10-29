import { CORNERS, SIDES } from "./box-properties.ts";
import type { Expansion, ExpansionInput } from "./property-kit.ts";
import type { Declaration } from "./types.ts";
import { Reader } from "#src/css/parse/reader.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import { parseLength, parseVariable, splitSlash } from "#src/css/parse/values.js";

const MAX_BOX_VALUES = 4;
const MAX_PAIR_VALUES = 2;

// CSS's thin, medium and thick, in pixels.
const BORDER_WIDTH_KEYWORDS = new Map([
  ["thin", "1px"],
  ["medium", "3px"],
  ["thick", "5px"]
]);
const DEFAULT_BORDER_WIDTH = "medium";
const BORDER_STYLES = new Set(["none", "solid", "hidden"]);

const UNSUPPORTED_BORDER_STYLES = new Set(["dashed", "dotted", "double", "groove", "ridge", "inset", "outset"]);
const FONT_STYLES = new Set(["normal", "italic", "oblique"]);
const FONT_WEIGHT_WORDS = new Set(["normal", "bold", "bolder", "lighter"]);
const IMAGE_OR_GRADIENT = /^(url|image|image-set|(repeating-)?(linear|radial|conic)-gradient)\(/iu;

// The shorthands whose whole value may be one var() to a WinUI Thickness or
// CornerRadius: not expanded.
const WHOLE_VARIABLE_SHORTHANDS = new Set(["margin", "padding", "border-width", "border-radius"]);

/** A declaration that is `declaration` with another property and value: the longhand a shorthand expands to. */
export function longhand({ declaration, property, value }: {
  declaration: Declaration;
  property: string;
  value: string;
}) {
  return {
    ...declaration,
    property,
    value
  };
}

// CSS's one-to-four value box: top, right, bottom, left (or the four corners).
function box(values: string[]) {
  const [first, second = first, third = first, fourth = second] = values;
  const isCounted = values.length >= 1 && values.length <= MAX_BOX_VALUES;
  const isComplete = first !== undefined && second !== undefined && third !== undefined && fourth !== undefined;
  const isBox = isCounted && isComplete;
  return isBox ? [first, second, third, fourth] : null;
}

function isWholeVariable(declaration: Declaration) {
  return parseVariable(declaration.value) !== null;
}

/** A CSS one-to-four value box (top right bottom left) as a longhand per name. */
export function expandBox({ declaration, names, reader, template }: {
  declaration: Declaration;
  names: readonly string[];
  reader: Reader;
  template(name: string): string;
}) {
  const values = box(reader.words);
  const isValuesMissing = values === null;
  if (isValuesMissing) {
    reader.expected("one to four values");
    return [];
  }

  return names.map((name, index) => longhand({
    declaration,
    property: template(name),
    value: values[index] ?? ""
  }));
}

/**
 * The width, style and color of a border or an outline, in any order; null
 * after an error. A width keyword is in pixels, and a missing width is CSS's
 * `medium`.
 */
export function readLineWords({ reader, styles }: {
  reader: Reader;
  styles: ReadonlySet<string>;
}) {
  let width = DEFAULT_BORDER_WIDTH;
  let style = "";
  let color: string | null = null;
  for (const word of reader.words) {
    const lower = word.toLowerCase();
    const isWidth = parseLength(word) !== null || BORDER_WIDTH_KEYWORDS.has(lower);
    if (UNSUPPORTED_BORDER_STYLES.has(lower)) {
      return reader.error(`${reader.declaration.property}: ${lower} has no WinUI meaning (WinUI draws solid lines only; use solid or none)`);
    }

    if (styles.has(lower)) {
      style = lower;
    } else if (isWidth) {
      width = lower;
    } else if (color === null) {
      color = word;
    } else {
      return reader.expected("[width] [style] [color]");
    }
  }

  const isStyleMissing = style === "";
  if (isStyleMissing) {
    return reader.expected(`a style (${[...styles].join(", ")})`);
  }

  return {
    width: BORDER_WIDTH_KEYWORDS.get(width) ?? width,
    style,
    color
  };
}

function expandBorder({ declaration, reader, sideNames }: {
  declaration: Declaration;
  reader: Reader;
  sideNames: readonly string[];
}) {
  const words = readLineWords({
    reader,
    styles: BORDER_STYLES
  });
  const isWordsMissing = words === null;
  if (isWordsMissing) {
    return [];
  }

  const widths = sideNames.map(side => longhand({
    declaration,
    property: `border-${side}-width`,
    value: words.width
  }));
  const rest = [longhand({
    declaration,
    property: "border-style",
    value: words.style
  })];
  const colors = words.color === null ? [] : [longhand({
    declaration,
    property: "border-color",
    value: words.color
  })];
  return [...widths, ...rest, ...colors];
}

function expandBackground({ declaration, reader }: ExpansionInput) {
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return [];
  }

  const isImageOrGradient = IMAGE_OR_GRADIENT.test(word);
  if (isImageOrGradient) {
    return [longhand({
      declaration,
      property: "background-image",
      value: word
    })];
  }

  const value = word.toLowerCase() === "none" ? "transparent" : word;
  return [longhand({
    declaration,
    property: "background-color",
    value
  })];
}

function expandFont({ declaration, reader }: ExpansionInput) {
  const words = reader.words;
  const sizeIndex = words.findIndex(word => parseLength(splitSlash(word)[0] ?? "") !== null);
  const isSizeMissing = sizeIndex === -1;
  if (isSizeMissing) {
    reader.expected("[style] [weight] size[/line-height] family");
    return [];
  }

  const result: Declaration[] = [];
  for (const word of words.slice(0, sizeIndex)) {
    const lower = word.toLowerCase();
    const isStyle = FONT_STYLES.has(lower);
    const isWeight = FONT_WEIGHT_WORDS.has(lower) || /^\d+$/u.test(word);
    if (isStyle) {
      result.push(
        longhand({
          declaration,
          property: "font-style",
          value: lower
        })
      );
    } else if (isWeight) {
      result.push(
        longhand({
          declaration,
          property: "font-weight",
          value: lower
        })
      );
    }
  }

  const [size = "", lineHeight] = splitSlash(words[sizeIndex] ?? "");
  result.push(
    longhand({
      declaration,
      property: "font-size",
      value: size
    })
  );

  const hasLineHeight = lineHeight !== undefined;
  if (hasLineHeight) {
    result.push(
      longhand({
        declaration,
        property: "line-height",
        value: lineHeight
      })
    );
  }

  const family = words.slice(sizeIndex + 1).join(" ");
  const hasFamily = family !== "";
  if (hasFamily) {
    result.push(
      longhand({
        declaration,
        property: "font-family",
        value: family
      })
    );
  }

  return result;
}

function expandPair({ declaration, reader, names }: {
  declaration: Declaration;
  reader: Reader;
  names: readonly [string, string];
}) {
  const [first, second] = reader.words;
  const isValid = first !== undefined && reader.words.length <= MAX_PAIR_VALUES;
  if (!isValid) {
    reader.expected("one or two values");
    return [];
  }

  return [
    longhand({
      declaration,
      property: names[0],
      value: first
    }),
    longhand({
      declaration,
      property: names[1],
      value: second ?? first
    })
  ];
}

// `2`, `span 2`, or `2 / 4`, `2 / span 2`: a start and an end line.
function expandLines({ declaration, reader, axis }: {
  declaration: Declaration;
  reader: Reader;
  axis: "column" | "row";
}) {
  const [start, end, ...rest] = splitSlash(declaration.value);
  const isValid = start !== undefined && start !== "" && rest.length === 0;
  if (!isValid) {
    reader.expected("a line, `span n`, or `start / end`");
    return [];
  }

  const startDeclaration = longhand({
    declaration,
    property: `grid-${axis}-start`,
    value: start
  });
  return end === undefined
    ? [startDeclaration]
    : [startDeclaration, longhand({
      declaration,
      property: `grid-${axis}-end`,
      value: end
    })];
}

function expandRadius({ declaration, reader }: ExpansionInput) {
  const isElliptical = declaration.value.includes("/");
  if (isElliptical) {
    reader.error("border-radius: elliptical corners (a / b) have no WinUI meaning; a CornerRadius is circular");
    return [];
  }

  return expandBox({
    declaration,
    names: CORNERS,
    reader,
    template: name => `border-${name}-radius`
  });
}

function expandFlow({ declaration, reader }: ExpansionInput) {
  const [direction = ""] = reader.words;
  return [longhand({
    declaration,
    property: "flex-direction",
    value: direction
  })];
}

function sideExpansion(side: (typeof SIDES)[number]) {
  function expandSide({ declaration, reader }: ExpansionInput) {
    return expandBorder({
      declaration,
      reader,
      sideNames: [side]
    });
  }

  return [`border-${side}`, expandSide] as const;
}

const expansions = new Map<string, Expansion>([
  ["margin", ({ declaration, reader }) => expandBox({
    declaration,
    names: SIDES,
    reader,
    template: name => `margin-${name}`
  })],
  ["padding", ({ declaration, reader }) => expandBox({
    declaration,
    names: SIDES,
    reader,
    template: name => `padding-${name}`
  })],
  [
    "border-width",
    ({ declaration, reader }) => expandBox({
      declaration,
      names: SIDES,
      reader,
      template: name => `border-${name}-width`
    })
  ],
  ["border-radius", expandRadius],
  ["border", ({ declaration, reader }) => expandBorder({
    declaration,
    reader,
    sideNames: SIDES
  })],
  ...SIDES.map(sideExpansion),
  ["background", expandBackground],
  ["font", expandFont],
  ["gap", ({ declaration, reader }) => expandPair({
    declaration,
    reader,
    names: ["row-gap", "column-gap"]
  })],
  ["overflow", ({ declaration, reader }) => expandPair({
    declaration,
    reader,
    names: ["overflow-x", "overflow-y"]
  })],
  ["place-self", ({ declaration, reader }) => expandPair({
    declaration,
    reader,
    names: ["align-self", "justify-self"]
  })],
  ["grid-column", ({ declaration, reader }) => expandLines({
    declaration,
    reader,
    axis: "column"
  })],
  ["grid-row", ({ declaration, reader }) => expandLines({
    declaration,
    reader,
    axis: "row"
  })],
  ["flex-flow", expandFlow]
]);

/**
 * Expands a CSS shorthand into the longhands the property table lowers
 * (margin into its four sides, border into width, style and color...). A
 * shorthand whose whole value is one `var(--name)` stays as it is: the
 * resource holds the complete value (a Thickness, a CornerRadius).
 */
export function expandDeclaration({ declaration, options, extra = new Map() }: {
  declaration: Declaration;
  options: LowerOptions;
  /** The shorthands of the groups an app opted into. */
  extra?: ReadonlyMap<string, Expansion>;
}) {
  const expansion = expansions.get(declaration.property) ?? extra.get(declaration.property);
  const isExpansionMissing = expansion === undefined;
  if (isExpansionMissing) {
    return [declaration];
  }

  const shouldKeepVariable = WHOLE_VARIABLE_SHORTHANDS.has(declaration.property) && isWholeVariable(declaration);
  if (shouldKeepVariable) {
    return [declaration];
  }

  const reader = new Reader(declaration, options);
  return expansion({
    declaration,
    reader
  });
}
