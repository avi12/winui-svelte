import type { ColorScheme, ResourceEntry } from "./types.ts";
import { parseColor } from "#src/css/parse/colors.js";
import { parseLength, parseNumber, parseVariable } from "#src/css/parse/values.js";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { ResourceKind, resourceNameOf } from "#src/css/runtime/resources.js";

/** One custom property declaration, with the color scheme block it was written in. */
export interface Variable {
  name: string;
  value: string;
  scheme: ColorScheme;
}

/** A resource a custom property defines, with the kind WinUI gives it. */
export interface VariableEntry extends ResourceEntry {
  kind: ResourceKind;
}

function entryFor({ scheme, key, xaml, kind }: {
  scheme: ColorScheme;
  key: string;
  xaml: string;
  kind: ResourceKind;
}) {
  return {
    scheme,
    key,
    xaml,
    kind
  } satisfies VariableEntry;
}

/**
 * A color value: written out (`#FF0000`), or a system color WinUI keeps current
 * as the user's contrast theme changes (`SystemColorWindowTextColor`).
 */
type ColorValue =
  | {
    kind: "literal";
    color: string;
  }
  | {
    kind: "system";
    key: string;
  };

// CSS's system colors, as the contrast theme colors WinUI names them.
const SYSTEM_COLOR_KEYWORDS = new Map([
  ["canvas", "SystemColorWindowColor"],
  ["canvastext", "SystemColorWindowTextColor"],
  ["buttonface", "SystemColorButtonFaceColor"],
  ["buttontext", "SystemColorButtonTextColor"],
  ["graytext", "SystemColorGrayTextColor"],
  ["highlight", "SystemColorHighlightColor"],
  ["highlighttext", "SystemColorHighlightTextColor"],
  ["linktext", "SystemColorHotlightColor"]
]);
const SYSTEM_COLOR_PREFIX = "SystemColor";

// `var(--system-color-window-text-color)` or a CSS system color such as CanvasText.
function systemColorKey({ value, catalogue }: {
  value: string;
  catalogue: ResourceCatalogue;
}) {
  const fromKeyword = SYSTEM_COLOR_KEYWORDS.get(value.toLowerCase());
  const hasKeyword = fromKeyword !== undefined;
  if (hasKeyword) {
    return fromKeyword;
  }

  const reference = parseVariable(value);
  const isReferenceMissing = reference === null;
  if (isReferenceMissing) {
    return null;
  }

  const key = catalogue.keyOf(resourceNameOf(reference.name));
  const isSystemColor = key?.startsWith(SYSTEM_COLOR_PREFIX) === true && catalogue.kindOf(key) === ResourceKind.COLOR;
  return isSystemColor ? key : null;
}

function brushColor(value: ColorValue) {
  return value.kind === "system" ? `{ThemeResource ${value.key}}` : value.color;
}

// WinUI's templates read these as brushes, so a known brush (or an alias, which
// stands for one in generic.xaml) takes a SolidColorBrush and no Color beside it.
function colorEntries({ variable, key, known, value }: {
  variable: Variable;
  key: string;
  known: ResourceKind | undefined;
  value: ColorValue;
}) {
  const { scheme } = variable;
  const isBrush = known === ResourceKind.BRUSH || known === ResourceKind.ALIAS;
  if (isBrush) {
    return [entryFor({
      scheme,
      key,
      xaml: `<SolidColorBrush x:Key="${key}" Color="${brushColor(value)}"/>`,
      kind: ResourceKind.BRUSH
    })];
  }

  const colorXaml = value.kind === "system" ? `<StaticResource x:Key="${key}" ResourceKey="${value.key}"/>` : `<Color x:Key="${key}">${value.color}</Color>`;
  const brushSource = value.kind === "system" ? brushColor(value) : `{StaticResource ${key}}`;
  return [
    entryFor({
      scheme,
      key,
      xaml: colorXaml,
      kind: ResourceKind.COLOR
    }),
    entryFor({
      scheme,
      key: `${key}Brush`,
      xaml: `<SolidColorBrush x:Key="${key}Brush" Color="${brushSource}"/>`,
      kind: ResourceKind.BRUSH
    })
  ];
}

const LENGTH_ELEMENTS = new Map<ResourceKind, (key: string, length: number) => string>([
  [ResourceKind.THICKNESS, (key, length) => `<Thickness x:Key="${key}">${length},${length},${length},${length}</Thickness>`],
  [ResourceKind.CORNER_RADIUS, (key, length) => `<CornerRadius x:Key="${key}">${length}</CornerRadius>`]
]);

function lengthEntries({ variable, key, known, length }: {
  variable: Variable;
  key: string;
  known: ResourceKind | undefined;
  length: number;
}) {
  const { scheme } = variable;
  const element = known === undefined ? undefined : LENGTH_ELEMENTS.get(known);
  const hasElement = element !== undefined;
  if (hasElement) {
    return [entryFor({
      scheme,
      key,
      xaml: element(key, length),
      kind: known ?? ResourceKind.DOUBLE
    })];
  }

  return [entryFor({
    scheme,
    key,
    xaml: `<x:Double x:Key="${key}">${length}</x:Double>`,
    kind: ResourceKind.DOUBLE
  })];
}

const LENGTH_KINDS: ReadonlySet<ResourceKind | undefined> = new Set([
  undefined,
  ResourceKind.ALIAS,
  ResourceKind.DOUBLE,
  ResourceKind.THICKNESS,
  ResourceKind.CORNER_RADIUS
]);
const COLOR_KINDS: ReadonlySet<ResourceKind | undefined> = new Set([
  undefined,
  ResourceKind.ALIAS,
  ResourceKind.BRUSH,
  ResourceKind.COLOR
]);

function colorValueOf({ text, catalogue }: {
  text: string;
  catalogue: ResourceCatalogue;
}) {
  const system = systemColorKey({
    value: text,
    catalogue
  });
  const isSystem = system !== null;
  if (isSystem) {
    return {
      kind: "system",
      key: system
    } as const;
  }

  const color = parseColor(text);
  return color === null ? null : {
    kind: "literal",
    color
  } as const;
}

/**
 * The resources a custom property defines. A key WinUI defines keeps WinUI's
 * spelling and kind (`--button-background-pointer-over` is a Brush, so it gets
 * a SolidColorBrush: a template that reads a brush gets no Color); any other is
 * a Color with a Brush of the same name plus `Brush`, or a Double.
 */
export function variableEntries({ variable, catalogue, reportProblem }: {
  variable: Variable;
  catalogue: ResourceCatalogue;
  reportProblem(message: string): void;
}) {
  const name = resourceNameOf(variable.name);
  const key = catalogue.keyOf(name) ?? name;
  const known = catalogue.kindOf(key);
  const value = colorValueOf({
    text: variable.value,
    catalogue
  });
  const hasColor = value !== null;
  const isColorKind = hasColor && COLOR_KINDS.has(known);
  if (isColorKind) {
    return colorEntries({
      variable,
      key,
      known,
      value
    });
  }

  const length = parseLength(variable.value) ?? parseNumber(variable.value);
  const hasLength = length !== null;
  const isLengthKind = hasLength && LENGTH_KINDS.has(known);
  if (isLengthKind) {
    return lengthEntries({
      variable,
      key,
      known,
      length
    });
  }

  const isMismatch = (hasColor || hasLength) && known !== undefined;
  if (isMismatch) {
    reportProblem(`${variable.name}: ${key} is a WinUI ${known} resource, and "${variable.value}" cannot be one`);
    return [];
  }

  reportProblem(`${variable.name}: expected a color or a length in px, found "${variable.value}"`);
  return [];
}
