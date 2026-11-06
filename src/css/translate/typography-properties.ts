import { setter } from "./property-kit.ts";
import type { ExpansionInput, GroupInput, PropertyGroup } from "./property-kit.ts";
import { longhand } from "./shorthands.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseNumber, splitCommas, splitWords } from "#src/css/parse/values.js";

// The OpenType side of CSS fonts, lowered onto WinUI's Typography attached
// properties (Typography.Capitals, Typography.StylisticSet1...): the
// font-variant-* keywords, font-kerning and font-feature-settings tags.

const OWNER = "Typography";
const TRUE = "True";
const FALSE = "False";
const NORMAL = "Normal";
const NORMAL_KEYWORD = "normal";
const NONE_KEYWORD = "none";
const STYLISTIC_SETS = 20;
const TAG_LENGTH = 4;
const SHORTHAND = "font-variant";
const KERNING = "font-kerning";
const LIGATURES = "font-variant-ligatures";
const ALTERNATES = "font-variant-alternates";
const FEATURE_SETTINGS = "font-feature-settings";
const OPTICAL_SIZING = "font-optical-sizing";
const FUNCTIONAL_VALUE = /^[\w-]+\(/u;
const QUOTED = /^(["'])(.*)\1$/u;

/** A Typography property (without its owner) and the value a keyword or a feature gives it. */
type Setting = readonly [property: string, value: string];

// The value each property has until something sets it: what `normal` puts back.
const DEFAULTS = new Map([
  ["Capitals", NORMAL],
  ["NumeralStyle", NORMAL],
  ["NumeralAlignment", NORMAL],
  ["Fraction", NORMAL],
  ["Variants", NORMAL],
  ["SlashedZero", FALSE],
  ["StandardLigatures", TRUE],
  ["ContextualLigatures", TRUE],
  ["DiscretionaryLigatures", FALSE],
  ["HistoricalLigatures", FALSE],
  ["ContextualAlternates", TRUE],
  ["HistoricalForms", FALSE],
  ["EastAsianLanguage", NORMAL],
  ["EastAsianWidths", NORMAL],
  ["Kerning", TRUE]
]);

/** A keyword property of CSS fonts: what each of its keywords sets, and the words that mean `normal`. */
export interface TypographyKeywords {
  keywords: ReadonlyMap<string, readonly Setting[]>;
  /** The words that put back the defaults of every property the keywords set. */
  normalWords: readonly string[];
  /** What to write instead of a value WinUI cannot say, added to the error. */
  hint?: string;
}

function keywordsOf({ entries, normalWords = [NORMAL_KEYWORD], hint }: {
  entries: ReadonlyArray<readonly [string, readonly Setting[]]>;
  normalWords?: readonly string[];
  hint?: string;
}) {
  return {
    keywords: new Map(entries),
    normalWords,
    ...hint !== undefined && {
      hint
    }
  } satisfies TypographyKeywords;
}

const LIGATURE_PROPERTIES = ["StandardLigatures", "ContextualLigatures", "DiscretionaryLigatures", "HistoricalLigatures", "ContextualAlternates"];

/**
 * The keyword properties, each to the Typography properties its keywords set:
 * the one table the lowering and the editor data read.
 */
export const TYPOGRAPHY_KEYWORDS: ReadonlyMap<string, TypographyKeywords> = new Map([
  ["font-variant-numeric", keywordsOf({
    entries: [
      ["lining-nums", [["NumeralStyle", "Lining"]]],
      ["oldstyle-nums", [["NumeralStyle", "OldStyle"]]],
      ["proportional-nums", [["NumeralAlignment", "Proportional"]]],
      ["tabular-nums", [["NumeralAlignment", "Tabular"]]],
      ["diagonal-fractions", [["Fraction", "Slashed"]]],
      ["stacked-fractions", [["Fraction", "Stacked"]]],
      ["ordinal", [["Variants", "Ordinal"]]],
      ["slashed-zero", [["SlashedZero", TRUE]]]
    ]
  })],
  ["font-variant-caps", keywordsOf({
    entries: [
      ["small-caps", [["Capitals", "SmallCaps"]]],
      ["all-small-caps", [["Capitals", "AllSmallCaps"]]],
      ["petite-caps", [["Capitals", "PetiteCaps"]]],
      ["all-petite-caps", [["Capitals", "AllPetiteCaps"]]],
      ["unicase", [["Capitals", "Unicase"]]],
      ["titling-caps", [["Capitals", "Titling"]]]
    ]
  })],
  ["font-variant-position", keywordsOf({
    entries: [
      ["sub", [["Variants", "Subscript"]]],
      ["super", [["Variants", "Superscript"]]]
    ]
  })],
  [LIGATURES, keywordsOf({
    entries: [
      [NONE_KEYWORD, LIGATURE_PROPERTIES.map(property => [property, FALSE] as const)],
      ["common-ligatures", [["StandardLigatures", TRUE], ["ContextualLigatures", TRUE]]],
      ["no-common-ligatures", [["StandardLigatures", FALSE], ["ContextualLigatures", FALSE]]],
      ["discretionary-ligatures", [["DiscretionaryLigatures", TRUE]]],
      ["no-discretionary-ligatures", [["DiscretionaryLigatures", FALSE]]],
      ["historical-ligatures", [["HistoricalLigatures", TRUE]]],
      ["no-historical-ligatures", [["HistoricalLigatures", FALSE]]],
      ["contextual", [["ContextualAlternates", TRUE]]],
      ["no-contextual", [["ContextualAlternates", FALSE]]]
    ]
  })],
  [ALTERNATES, keywordsOf({
    entries: [["historical-forms", [["HistoricalForms", TRUE]]]],
    hint: "a functional value (stylistic(), styleset(), character-variant(), swash(), ornaments(), annotation()) names an @font-feature-values entry, which WinUI has no counterpart for; write the OpenType feature in font-feature-settings (\"ss02\", \"salt\" 2, \"swsh\" 1)"
  })],
  ["font-variant-east-asian", keywordsOf({
    entries: [
      ["jis78", [["EastAsianLanguage", "Jis78"]]],
      ["jis83", [["EastAsianLanguage", "Jis83"]]],
      ["jis90", [["EastAsianLanguage", "Jis90"]]],
      ["jis04", [["EastAsianLanguage", "Jis04"]]],
      ["simplified", [["EastAsianLanguage", "Simplified"]]],
      ["traditional", [["EastAsianLanguage", "Traditional"]]],
      ["full-width", [["EastAsianWidths", "Full"]]],
      ["proportional-width", [["EastAsianWidths", "Proportional"]]],
      ["ruby", [["Variants", "Ruby"]]]
    ]
  })],
  [KERNING, keywordsOf({
    entries: [[NONE_KEYWORD, [["Kerning", FALSE]]]],
    normalWords: ["auto", NORMAL_KEYWORD]
  })]
]);

/**
 * An OpenType feature WinUI can set: a switch (`on` and `off`), or a count
 * (an alternate's index) when `on` is absent.
 */
interface TypographyFeature {
  property: string;
  on?: string;
  off?: string;
}

function switchOf(property: string) {
  return {
    property,
    on: TRUE,
    off: FALSE
  };
}

const CHOICES: ReadonlyArray<readonly [tag: string, property: string, on: string]> = [
  ["smcp", "Capitals", "SmallCaps"],
  ["c2sc", "Capitals", "AllSmallCaps"],
  ["pcap", "Capitals", "PetiteCaps"],
  ["c2pc", "Capitals", "AllPetiteCaps"],
  ["unic", "Capitals", "Unicase"],
  ["titl", "Capitals", "Titling"],
  ["lnum", "NumeralStyle", "Lining"],
  ["onum", "NumeralStyle", "OldStyle"],
  ["pnum", "NumeralAlignment", "Proportional"],
  ["tnum", "NumeralAlignment", "Tabular"],
  ["frac", "Fraction", "Slashed"],
  ["afrc", "Fraction", "Stacked"],
  ["sups", "Variants", "Superscript"],
  ["subs", "Variants", "Subscript"],
  ["ordn", "Variants", "Ordinal"],
  ["sinf", "Variants", "Inferior"],
  ["ruby", "Variants", "Ruby"],
  ["jp78", "EastAsianLanguage", "Jis78"],
  ["jp83", "EastAsianLanguage", "Jis83"],
  ["jp90", "EastAsianLanguage", "Jis90"],
  ["jp04", "EastAsianLanguage", "Jis04"],
  ["hojo", "EastAsianLanguage", "HojoKanji"],
  ["nlck", "EastAsianLanguage", "NlcKanji"],
  ["smpl", "EastAsianLanguage", "Simplified"],
  ["trad", "EastAsianLanguage", "Traditional"],
  ["tnam", "EastAsianLanguage", "TraditionalNames"],
  ["fwid", "EastAsianWidths", "Full"],
  ["hwid", "EastAsianWidths", "Half"],
  ["pwid", "EastAsianWidths", "Proportional"],
  ["qwid", "EastAsianWidths", "Quarter"],
  ["twid", "EastAsianWidths", "Third"]
];

const SWITCHES: ReadonlyArray<readonly [tag: string, property: string]> = [
  ["zero", "SlashedZero"],
  ["liga", "StandardLigatures"],
  ["clig", "ContextualLigatures"],
  ["dlig", "DiscretionaryLigatures"],
  ["hlig", "HistoricalLigatures"],
  ["calt", "ContextualAlternates"],
  ["kern", "Kerning"],
  ["case", "CaseSensitiveForms"],
  ["cpsp", "CapitalSpacing"],
  ["hist", "HistoricalForms"],
  ["mgrk", "MathematicalGreek"],
  ["expt", "EastAsianExpertForms"]
];

const COUNTS: ReadonlyArray<readonly [tag: string, property: string]> = [
  ["salt", "StylisticAlternates"],
  ["swsh", "StandardSwashes"],
  ["cswh", "ContextualSwashes"],
  ["nalt", "AnnotationAlternates"]
];

/** The OpenType feature tags `font-feature-settings` takes, each to the Typography property it sets. */
export function typographyFeatures() {
  const stylisticSets = Array.from({ length: STYLISTIC_SETS }, (_, index) => {
    const ordinal = index + 1;
    return [`ss${String(ordinal).padStart(2, "0")}`, switchOf(`StylisticSet${ordinal}`)] as const;
  });
  return new Map<string, TypographyFeature>([
    ...stylisticSets,
    ...CHOICES.map(([tag, property, on]) => [tag, {
      property,
      on,
      off: NORMAL
    }] as const),
    ...SWITCHES.map(([tag, property]) => [tag, switchOf(property)] as const),
    ...COUNTS.map(([tag, property]) => [tag, {
      property
    }] as const)
  ]);
}

/** The members the typography group lowers, and its shorthand: a sheet that uses one opts in. */
export const TYPOGRAPHY_MEMBERS = [...TYPOGRAPHY_KEYWORDS.keys(), FEATURE_SETTINGS, OPTICAL_SIZING, SHORTHAND];

// A setting and whether it only puts a default back (a `normal`), which any other setting overrides.
interface Chosen {
  value: string;
  isDefault: boolean;
  member: string;
}

type Choices = Map<string, Chosen>;

function choose({ choices, property, chosen, reader }: {
  choices: Choices;
  property: string;
  chosen: Chosen;
  reader: Reader;
}) {
  const earlier = choices.get(property);
  const isFirst = earlier === undefined || earlier.isDefault;
  if (isFirst) {
    choices.set(property, chosen);
    return;
  }

  const isConflict = !chosen.isDefault && earlier.value !== chosen.value;
  if (isConflict) {
    reader.error(`${reader.declaration.property}: ${earlier.member} already sets ${OWNER}.${property} to ${earlier.value}, and WinUI holds one value`);
  }
}

function defaultsOf(spec: TypographyKeywords) {
  const properties = new Set([...spec.keywords.values()].flatMap(settings => settings.map(([property]) => property)));
  return [...properties].map(property => [property, DEFAULTS.get(property) ?? NORMAL] as const);
}

function settingsOfWords({ reader, spec }: {
  reader: Reader;
  spec: TypographyKeywords;
}) {
  const words = reader.words.map(word => word.toLowerCase());
  const [first = ""] = words;
  const isNormal = words.length === 1 && spec.normalWords.includes(first);
  if (isNormal) {
    return {
      isDefault: true,
      settings: defaultsOf(spec)
    };
  }

  const settings: Setting[] = [];
  for (const word of words) {
    const found = spec.keywords.get(word);
    if (!found) {
      const hasHint = FUNCTIONAL_VALUE.test(word) && spec.hint !== undefined;
      reader.expectedToken({
        what: `${[...spec.normalWords, ...spec.keywords.keys()].join(", ")}${hasHint ? `; ${spec.hint}` : ""}`,
        token: word
      });
      return null;
    }

    const isRepeated = found.some(([property]) => settings.some(([earlier]) => earlier === property));
    if (isRepeated) {
      reader.error(`${reader.declaration.property}: "${word}" sets what another word of the value already sets`);
      return null;
    }

    settings.push(...found);
  }

  return {
    isDefault: false,
    settings
  };
}

function featureValue({ reader, word = "on" }: {
  reader: Reader;
  word?: string;
}) {
  const lower = word.toLowerCase();
  const isOn = lower === "on";
  if (isOn) {
    return 1;
  }

  const isOff = lower === "off";
  if (isOff) {
    return 0;
  }

  const count = parseNumber(lower);
  const isCount = count !== null && Number.isInteger(count) && count >= 0;
  if (isCount) {
    return count;
  }

  return reader.expectedToken({
    what: "on, off or a whole number",
    token: word
  });
}

function featureSetting({ reader, entry, features }: {
  reader: Reader;
  entry: string;
  features: ReadonlyMap<string, TypographyFeature>;
}) {
  const [quoted = "", word, ...rest] = splitWords(entry);
  const tag = quoted.replace(QUOTED, "$2");
  const isTag = tag !== quoted && tag.length === TAG_LENGTH && rest.length === 0;
  if (!isTag) {
    return reader.expectedToken({
      what: "a quoted four-letter tag and an optional value (\"ss01\" on, \"salt\" 2)",
      token: entry
    });
  }

  const feature = features.get(tag);
  if (!feature) {
    return reader.error(`${FEATURE_SETTINGS}: WinUI's Typography has no property for the OpenType feature "${tag}"; it sets ${[...features.keys()].join(", ")}`);
  }

  const value = featureValue({
    reader,
    ...word !== undefined && {
      word
    }
  });
  const isMissing = value === null;
  if (isMissing) {
    return null;
  }

  const { property, on, off = NORMAL } = feature;
  const isCount = on === undefined;
  if (isCount) {
    return [property, String(value)] as const;
  }

  const isOn = value > 0;
  return [property, isOn ? on : off] as const;
}

// font-feature-settings applies after the font-variant properties, as in CSS:
// where both set a property, the feature wins.
function applyFeatures({ choices, reader }: {
  choices: Choices;
  reader: Reader;
}) {
  const isNormal = reader.declaration.value.trim().toLowerCase() === NORMAL_KEYWORD;
  if (isNormal) {
    return;
  }

  const features = typographyFeatures();
  for (const entry of splitCommas(reader.declaration.value)) {
    const setting = featureSetting({
      reader,
      entry,
      features
    });
    if (setting) {
      choices.set(setting[0], {
        value: setting[1],
        isDefault: false,
        member: FEATURE_SETTINGS
      });
    }
  }
}

// DirectWrite applies a variable font's optical size axis from the font size by itself, with no switch to turn it off.
function checkOpticalSizing(reader: Reader) {
  const word = reader.single();
  const isAuto = word === null || word.toLowerCase() === "auto";
  if (!isAuto) {
    reader.expectedToken({
      what: "auto (WinUI applies a variable font's optical size from the font size, and nothing turns it off)",
      token: word
    });
  }
}

function lowerTypography(input: GroupInput) {
  const choices: Choices = new Map();
  for (const [member, spec] of TYPOGRAPHY_KEYWORDS) {
    const reader = input.readers.get(member);
    const found = reader && settingsOfWords({
      reader,
      spec
    });
    const isUsable = reader !== undefined && found !== null && found !== undefined;
    if (!isUsable) {
      continue;
    }

    for (const [property, value] of found.settings) {
      choose({
        choices,
        property,
        chosen: {
          value,
          isDefault: found.isDefault,
          member
        },
        reader
      });
    }
  }

  const features = input.readers.get(FEATURE_SETTINGS);
  if (features) {
    applyFeatures({
      choices,
      reader: features
    });
  }

  const opticalSizing = input.readers.get(OPTICAL_SIZING);
  if (opticalSizing) {
    checkOpticalSizing(opticalSizing);
  }

  return [...choices].map(([property, { value }]) => setter({
    property: `${OWNER}.${property}`,
    value
  }));
}

const VARIANT_LONGHANDS = [...TYPOGRAPHY_KEYWORDS.keys()].filter(member => member !== KERNING);

// The longhand of `font-variant` a word belongs to, by the keywords each takes.
function longhandOf(word: string) {
  const isFunctional = FUNCTIONAL_VALUE.test(word);
  if (isFunctional) {
    return ALTERNATES;
  }

  return VARIANT_LONGHANDS.find(member => TYPOGRAPHY_KEYWORDS.get(member)?.keywords.has(word));
}

// `font-variant`: each word to the longhand that takes it; the longhands it does not name go back to normal.
function expandVariant({ declaration, reader }: ExpansionInput) {
  const words = reader.words.map(word => word.toLowerCase());
  const isNone = words.length === 1 && words[0] === NONE_KEYWORD;
  const isNormal = words.length === 1 && words[0] === NORMAL_KEYWORD;
  const byLonghand = new Map<string, string[]>(VARIANT_LONGHANDS.map(member => [member, []]));
  const isListed = !isNone && !isNormal;
  for (const word of isListed ? words : []) {
    const member = longhandOf(word);
    const listed = member === undefined ? undefined : byLonghand.get(member);
    if (!listed) {
      reader.expectedToken({
        what: "normal, none, or keywords of font-variant-caps, -numeric, -ligatures, -position, -alternates and -east-asian",
        token: word
      });
      return [];
    }

    listed.push(word);
  }

  return [...byLonghand].map(([member, listed]) => longhand({
    declaration,
    property: member,
    value: variantValue({
      listed,
      isNone: member === LIGATURES && isNone
    })
  }));
}

function variantValue({ listed, isNone }: {
  listed: readonly string[];
  isNone: boolean;
}) {
  if (isNone) {
    return NONE_KEYWORD;
  }

  return listed.length === 0 ? NORMAL_KEYWORD : listed.join(" ");
}

/**
 * The group of the OpenType font properties: `font-variant-*`, `font-kerning`,
 * `font-feature-settings` and `font-optical-sizing`.
 */
export function typographyGroups() {
  return [{
    members: [...TYPOGRAPHY_KEYWORDS.keys(), FEATURE_SETTINGS, OPTICAL_SIZING],
    lower: lowerTypography,
    shorthands: new Map([[SHORTHAND, expandVariant]])
  } satisfies PropertyGroup];
}
