import { cssNameEntries, settersOf } from "./css-names.ts";
import { enumNamesTypeOf } from "./emit.ts";
import type { ClassModel } from "./model.ts";
import { namedColors } from "#src/css/parse/named-colors.js";
import { discretePropertyOf, discreteValueOf, discreteWordsOf } from "#src/css/translate/discrete-properties.js";

// What the WebStorm plugin (ide/webstorm) reads to turn a prop into the CSS
// that sets the same WinUI property: for each prop whose property the
// translator can set from CSS, the CSS property and how a value converts. The
// conversions are found by asking the translator what a CSS value lowers to
// and keeping a form only when it lowers to exactly this property alone.

const INDENT = 2;
const DEFAULT_SENTENCE = /[Tt]he default (?:value )?is (-?\d+(?:\.\d+)?|[A-Za-z]\w*)/u;
const ENUM_NAME_SUFFIX = "Name";
const EXAMPLE_LENGTH = "12px";
const LENGTH_LIST = "1px 2px";
const LOWERED_LENGTH = "12";
const EXAMPLE_NUMBERS = new Map([
  ["0.5", "0.5"],
  ["3", "3"]
]);
const EXAMPLE_TEXT = "Segoe UI";
const EXAMPLE_SIDES = "1px 2px 3px 4px";
const THICKNESS_SIDES = "4,1,2,3";
const CORNER_SIDES = "1,2,3,4";
const UNIFORM_SIDE = "5px";
const UNIFORM_SIDES = "5,5,5,5";
const SOLO_PROBES = ["1", EXAMPLE_LENGTH];
const COLOR_EXAMPLES = new Map([
  ["#f00", "#FF0000"],
  ["#ff0000", "#FF0000"],
  ["#ff000080", "#80FF0000"],
  ["transparent", "#00FFFFFF"]
]);
const COLOR_KEYWORDS = ["transparent"];
const PLAIN_WEIGHTS = ["100", "200", "300", "400", "500", "600", "700", "800", "900"];

// The words probed on a property, canonical spelling first: where several
// words lower to one value, the first is the one a prop converts to.
const KEYWORD_PROBES = [
  "visible",
  "hidden",
  "collapse",
  "auto",
  "none",
  "normal",
  "bold",
  "bolder",
  "lighter",
  "italic",
  "oblique",
  "nowrap",
  "wrap",
  "balance",
  "ellipsis",
  "clip",
  "underline",
  "line-through",
  "start",
  "left",
  "center",
  "end",
  "right",
  "justify",
  "top",
  "bottom",
  "flex-start",
  "flex-end",
  "stretch",
  "baseline",
  "space-between",
  "space-around",
  "space-evenly",
  "row",
  "column",
  "row-reverse",
  "column-reverse",
  "scroll",
  "block",
  "inline",
  "flex",
  "grid",
  "text",
  "all",
  "contain",
  "cover",
  "fill",
  "scale-down",
  "dark",
  "light",
  "ultra-condensed",
  "extra-condensed",
  "condensed",
  "semi-condensed",
  "semi-expanded",
  "expanded",
  "extra-expanded",
  "ultra-expanded",
  "break-all",
  "break-word",
  "keep-all",
  "pre",
  "pre-wrap",
  "pre-line",
  ...PLAIN_WEIGHTS
];

/** How a prop's value converts to the CSS value of its counterpart. */
const ConversionKind = {
  KEYWORD: "keyword",
  LENGTH: "length",
  NUMBER: "number",
  COLOR: "color",
  THICKNESS: "thickness",
  CORNER_RADIUS: "cornerRadius",
  TEXT: "text",
  UNSUPPORTED: "unsupported"
} as const;

/** One of `ConversionKind`'s values. */
type ConversionKind = (typeof ConversionKind)[keyof typeof ConversionKind];

/** Why a prop with a CSS counterpart has no conversion. */
const UnsupportedReason = {
  SEVERAL_SETTERS: "the CSS property sets other WinUI properties too",
  NO_VALUE_FORM: "no plain value converts to the same WinUI value"
} as const;

interface Candidate {
  key: string;
  winName: string;
  cssName: string;
  enumTypes: string[];
  description: string | undefined;
}

interface Conversion {
  winuiProperty: string;
  cssProperty: string;
  kind: ConversionKind;
  enumTypes: string[];
  keywords?: Record<string, string>;
  defaultValue?: string;
  reason?: string;
}

function loweredValue({ cssName, winName, value }: {
  cssName: string;
  winName: string;
  value: string;
}) {
  const setters = settersOf({
    cssName,
    value
  });
  const [only] = setters;
  const isOnlyThis = setters.length === 1 && only?.property.toLowerCase() === winName.toLowerCase();
  const isSetter = only?.kind === "setter" && isOnlyThis;
  return isSetter ? only.value : undefined;
}

// A word the translator reads as the default lowers to no setter, so it is asked for by name
function discreteWordsOfCandidate({ cssName, winName }: Candidate) {
  const isDiscrete = discretePropertyOf(cssName)?.toLowerCase() === winName.toLowerCase();
  const words = isDiscrete ? discreteWordsOf(cssName) : [];
  return words.flatMap(word => {
    const lowered = discreteValueOf({
      member: cssName,
      word
    });
    return lowered === undefined ? [] : [[lowered, word] as const];
  });
}

// What a word lowers to, and for a plain number the translator reads as itself (a font weight) the number too
function probedWords({ cssName, winName }: Candidate) {
  return KEYWORD_PROBES.flatMap(word => {
    const lowered = loweredValue({
      cssName,
      winName,
      value: word
    });
    const isLowered = lowered !== undefined && lowered !== "";
    const isNumberWord = PLAIN_WEIGHTS.includes(word);
    // A number the translator turns into another number is an index, not a weight
    const isIndex = isLowered && isNumberWord && !Number.isNaN(Number(lowered));
    const isSkipped = !isLowered || isIndex;
    if (isSkipped) {
      return [];
    }

    return isNumberWord ? [[lowered, word] as const, [word, word] as const] : [[lowered, word] as const];
  });
}

// The value each WinUI member is set to by a word; the first word for a member wins
function keywordsOf(candidate: Candidate) {
  const keywords = new Map<string, string>();
  for (const [lowered, word] of [...probedWords(candidate), ...discreteWordsOfCandidate(candidate)]) {
    const isNew = !keywords.has(lowered);
    if (isNew) {
      keywords.set(lowered, word);
    }
  }

  return keywords;
}

function literalKindOf({ cssName, winName }: Candidate) {
  function lowered(value: string) {
    return loweredValue({
      cssName,
      winName,
      value
    });
  }

  const isColor = [...COLOR_EXAMPLES].every(([css, expected]) => lowered(css) === expected);
  const isSides = lowered(UNIFORM_SIDE) === UNIFORM_SIDES;
  const isNumber = [...EXAMPLE_NUMBERS].some(([css, expected]) => lowered(css) === expected);
  const checks: Array<[ConversionKind, boolean]> = [
    [ConversionKind.THICKNESS, isSides && lowered(EXAMPLE_SIDES) === THICKNESS_SIDES],
    [ConversionKind.CORNER_RADIUS, isSides && lowered(EXAMPLE_SIDES) === CORNER_SIDES],
    [ConversionKind.COLOR, isColor],
    [ConversionKind.TEXT, lowered(EXAMPLE_TEXT) === EXAMPLE_TEXT],
    [ConversionKind.LENGTH, lowered(EXAMPLE_LENGTH) === LOWERED_LENGTH && lowered(LENGTH_LIST) === undefined],
    [ConversionKind.NUMBER, isNumber]
  ];
  return checks.find(([, isMatch]) => isMatch)?.[0];
}

// A CSS value that sets this property and others: converting the prop would
// leave the others unset.
function hasSideEffects({ cssName, winName }: Candidate) {
  const probes = [
    ...KEYWORD_PROBES,
    ...EXAMPLE_NUMBERS.keys(),
    ...COLOR_EXAMPLES.keys(),
    ...SOLO_PROBES,
    EXAMPLE_SIDES,
    EXAMPLE_TEXT
  ];
  return probes.some(value => {
    const setters = settersOf({
      cssName,
      value
    });
    const isSetHere = setters.some(setter => setter.property.toLowerCase() === winName.toLowerCase());
    return isSetHere && setters.length > 1;
  });
}

// The default WinUI's documentation names ("The default value is Visible"), as the CSS value the plugin
// leaves out; read only where it is a word of the keywords or a number
function defaultValueOf({ description, kind, keywords }: {
  description: string | undefined;
  kind: ConversionKind;
  keywords: Map<string, string>;
}) {
  const word = DEFAULT_SENTENCE.exec(description ?? "")?.[1];
  const hasWord = word !== undefined;
  if (!hasWord) {
    return undefined;
  }

  const defaults = new Map<ConversionKind, string | undefined>([
    [ConversionKind.KEYWORD, keywords.get(word)],
    [ConversionKind.LENGTH, `${Number(word)}px`],
    [ConversionKind.NUMBER, String(Number(word))]
  ]);
  const isNumeric = !Number.isNaN(Number(word));
  const isLiteral = kind === ConversionKind.KEYWORD || isNumeric;
  return isLiteral ? defaults.get(kind) : undefined;
}

function conversionOf(candidate: Candidate) {
  const { cssName, winName, enumTypes } = candidate;
  const keywords = keywordsOf(candidate);
  const hasKeywords = keywords.size > 0;
  const isConvertible = !hasSideEffects(candidate);
  const wordKind = hasKeywords ? ConversionKind.KEYWORD : ConversionKind.UNSUPPORTED;
  const kind = isConvertible ? literalKindOf(candidate) ?? wordKind : ConversionKind.UNSUPPORTED;
  const conversion: Conversion = {
    winuiProperty: winName,
    cssProperty: cssName,
    kind,
    enumTypes
  };
  const isUnsupported = kind === ConversionKind.UNSUPPORTED;
  const isKeyword = kind === ConversionKind.KEYWORD;
  const defaultValue = defaultValueOf({
    description: candidate.description,
    kind,
    keywords
  });
  const hasDefault = defaultValue !== undefined;
  if (hasDefault) {
    conversion.defaultValue = defaultValue;
  }

  if (isKeyword) {
    conversion.keywords = Object.fromEntries(
      [...keywords].toSorted(([first], [second]) => first.localeCompare(second))
    );
  }

  if (isUnsupported) {
    conversion.reason = isConvertible ? UnsupportedReason.NO_VALUE_FORM : UnsupportedReason.SEVERAL_SETTERS;
  }

  return conversion;
}

function candidatesOf(classes: ClassModel[]) {
  const cssNames = new Map(cssNameEntries().map(entry => [entry.property, entry.cssName]));
  const found = new Map<string, Candidate>();
  const members = classes.flatMap(level => [
    ...level.properties.map(property => ({
      key: property.key,
      winName: property.winName,
      enumNames: enumNamesTypeOf(property),
      description: level.documentation?.members.get(`P:${property.winName}`)
    })),
    ...level.attached.filter(attached => !attached.isSlot).map(attached => ({
      key: attached.key,
      winName: `${attached.owner.name}.${attached.name}`,
      enumNames: enumNamesTypeOf(attached),
      description: attached.documentation
    }))
  ]);
  for (const member of members) {
    const cssName = cssNames.get(member.winName.toLowerCase());
    const isCssSettable = cssName !== undefined;
    if (!isCssSettable) {
      continue;
    }

    const enumTypes = new Set(found.get(member.key)?.enumTypes);
    const enumName = member.enumNames?.slice(0, -ENUM_NAME_SUFFIX.length);
    const isEnum = enumName !== undefined;
    if (isEnum) {
      enumTypes.add(enumName);
    }

    found.set(member.key, {
      key: member.key,
      winName: member.winName,
      cssName,
      enumTypes: [...enumTypes].toSorted(),
      description: found.get(member.key)?.description ?? member.description
    });
  }

  return [...found.values()].toSorted((first, second) => first.key.localeCompare(second.key));
}

/**
 * The prop to CSS table of the WebStorm plugin as JSON: for every prop whose
 * WinUI property the translator sets from CSS, the CSS property, the kind of
 * value conversion (`unsupported` where no plain value converts safely, with
 * the reason) and for keyword kinds the CSS word of each WinUI member.
 */
export function emitWebstormCssMappings({ classes }: { classes: ClassModel[] }) {
  const attributes = Object.fromEntries(
    candidatesOf(classes).map(candidate => [candidate.key, conversionOf(candidate)])
  );
  return `${JSON.stringify({
    colorKeywords: COLOR_KEYWORDS,
    namedColors: Object.fromEntries(namedColors),
    attributes
  }, null, INDENT)}\n`;
}
