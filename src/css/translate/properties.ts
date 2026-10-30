import { borderThickness, cornerRadius, thicknessGroup } from "./box-properties.ts";
import {
  alignmentProperty,
  display,
  flexDirections,
  gap,
  gridPlacement,
  gridTemplate,
  overflow
} from "./layout-properties.ts";
import {
  brushProperty,
  COMPOSITION_PROPERTIES,
  keywordProperty,
  lengthProperty,
  simple
} from "./property-kit.ts";
import type { GroupInput, Output, PropertyGroup } from "./property-kit.ts";
import {
  fontFamily,
  fontStyles,
  fontWeight,
  letterSpacing,
  lineHeight,
  textAlignments,
  textDecorations,
  textOverflows,
  whiteSpaceKeywords,
  wrapKeywords
} from "./text-properties.ts";
import type { Declaration } from "./types.ts";
import {
  colorSchemes,
  hitTesting,
  opacity,
  visibilities,
  zIndex
} from "./visual-properties.ts";
import { NOT_A_NUMBER, Reader, UNBOUNDED } from "#src/css/parse/reader.js";
import type { LowerOptions } from "#src/css/parse/reader.js";

// Width and Height NaN is "as the parent allows", which a stretching element fills.
const FILL_SIZES = new Map([
  ["auto", NOT_A_NUMBER],
  ["100%", NOT_A_NUMBER]
]);
const BASED_ON_PROPERTY = "-winui-based-on";

/** The Style a declaration set lowers to. */
export interface LoweredStyle {
  basedOn: string | null;
  setters: Array<Extract<Output, { kind: "setter" | "content" }>>;
  writes: Array<Extract<Output, { kind: "write" }>>;
}

function basedOn(input: GroupInput) {
  const reader = input.reading(BASED_ON_PROPERTY);
  const key = reader.single();
  const isKeyMissing = key === null;
  if (isKeyMissing) {
    return [];
  }

  const isKnown = input.options.hasStyle(key);
  if (!isKnown) {
    reader.error(`${BASED_ON_PROPERTY}: ${key} is not a style WinUI defines (a key such as BodyTextBlockStyle)`);
    return [];
  }

  return [{
    kind: "basedOn",
    key
  } as const];
}

// THE property map: which CSS property becomes which WinUI property, and how
// its value is spelled. The groups are in precedence order: where two set the
// same WinUI property, the later one wins (display none over visibility). A
// property absent here has no WinUI meaning and fails the build;
// `explainUnsupported` (the build supplies it) says why for the likely ones.
export const propertyGroups: readonly PropertyGroup[] = [
  {
    members: [BASED_ON_PROPERTY],
    lower: basedOn
  },
  thicknessGroup({
    name: "margin",
    property: "Margin"
  }),
  thicknessGroup({
    name: "padding",
    property: "Padding"
  }),
  borderThickness(),
  brushProperty({
    member: "border-color",
    property: "BorderBrush"
  }),
  cornerRadius(),
  brushProperty({
    member: "background-color",
    property: "Background"
  }),
  brushProperty({
    member: "color",
    property: "Foreground"
  }),
  brushProperty({
    member: "stroke",
    property: "Stroke"
  }),
  lengthProperty({
    member: "stroke-width",
    property: "StrokeThickness"
  }),
  simple({
    member: "opacity",
    property: "Opacity",
    parse: opacity
  }),
  lengthProperty({
    member: "width",
    property: "Width",
    extra: FILL_SIZES
  }),
  lengthProperty({
    member: "height",
    property: "Height",
    extra: FILL_SIZES
  }),
  lengthProperty({
    member: "min-width",
    property: "MinWidth",
    extra: new Map([["auto", "0"]])
  }),
  lengthProperty({
    member: "min-height",
    property: "MinHeight",
    extra: new Map([["auto", "0"]])
  }),
  lengthProperty({
    member: "max-width",
    property: "MaxWidth",
    extra: new Map([["none", UNBOUNDED]])
  }),
  lengthProperty({
    member: "max-height",
    property: "MaxHeight",
    extra: new Map([["none", UNBOUNDED]])
  }),
  lengthProperty({
    member: "font-size",
    property: "FontSize"
  }),
  simple({
    member: "font-weight",
    property: "FontWeight",
    parse: fontWeight
  }),
  simple({
    member: "font-family",
    property: "FontFamily",
    parse: fontFamily
  }),
  keywordProperty({
    member: "font-style",
    property: "FontStyle",
    choices: fontStyles
  }),
  {
    members: ["line-height"],
    lower: lineHeight
  },
  simple({
    member: "letter-spacing",
    property: "CharacterSpacing",
    parse: letterSpacing
  }),
  keywordProperty({
    member: "text-align",
    property: "TextAlignment",
    choices: textAlignments
  }),
  keywordProperty({
    member: "text-wrap",
    property: "TextWrapping",
    choices: wrapKeywords
  }),
  keywordProperty({
    member: "white-space",
    property: "TextWrapping",
    choices: whiteSpaceKeywords
  }),
  keywordProperty({
    member: "text-overflow",
    property: "TextTrimming",
    choices: textOverflows
  }),
  keywordProperty({
    member: "text-decoration",
    property: "TextDecorations",
    choices: textDecorations
  }),
  keywordProperty({
    member: "text-decoration-line",
    property: "TextDecorations",
    choices: textDecorations
  }),
  alignmentProperty({
    member: "align-self",
    property: "VerticalAlignment",
    startName: "Top",
    endName: "Bottom"
  }),
  alignmentProperty({
    member: "justify-self",
    property: "HorizontalAlignment",
    startName: "Left",
    endName: "Right"
  }),
  keywordProperty({
    member: "flex-direction",
    property: "Orientation",
    choices: flexDirections
  }),
  {
    members: ["row-gap", "column-gap"],
    lower: gap
  },
  gridTemplate({
    target: "columns",
    member: "grid-template-columns"
  }),
  gridTemplate({
    target: "rows",
    member: "grid-template-rows"
  }),
  gridPlacement("grid-column"),
  gridPlacement("grid-row"),
  {
    members: ["overflow-x", "overflow-y"],
    lower: overflow
  },
  keywordProperty({
    member: "visibility",
    property: "Visibility",
    choices: visibilities
  }),
  {
    members: ["display"],
    lower: display
  },
  keywordProperty({
    member: "pointer-events",
    property: "IsHitTestVisible",
    choices: hitTesting
  }),
  keywordProperty({
    member: "color-scheme",
    property: "RequestedTheme",
    choices: colorSchemes
  }),
  simple({
    member: "z-index",
    property: "Canvas.ZIndex",
    parse: zIndex
  })
];

function readerFor({ readers, member }: {
  readers: ReadonlyMap<string, Reader>;
  member: string;
}) {
  const reader = readers.get(member);
  const isReaderMissing = reader === undefined;
  if (isReaderMissing) {
    throw new RangeError(`${member} is not present`);
  }

  return reader;
}

/**
 * Lowers an element's final declarations (longhands only, see
 * `expandDeclaration`) to WinUI Style setters. A declaration no group handles
 * is reported as an error through `options`. `extraGroups` are the groups an
 * app opts into (a gradient background, which costs a parser): they come after
 * the built-in ones, so they win where they set the same WinUI property.
 */
export function lowerDeclarations({ computed, options, extraGroups = [] }: {
  computed: ReadonlyMap<string, Declaration>;
  options: LowerOptions;
  extraGroups?: readonly PropertyGroup[];
}) {
  const groups = [
    ...extraGroups.filter(group => group.isFallback === true),
    ...propertyGroups,
    ...extraGroups.filter(group => group.isFallback !== true)
  ];
  const knownMembers = new Set(groups.flatMap(group => group.members));
  const outputs: Output[] = [];
  for (const group of groups) {
    const readers = new Map<string, Reader>();
    for (const member of group.members) {
      const declaration = computed.get(member);
      const hasDeclaration = declaration !== undefined;
      if (hasDeclaration) {
        readers.set(member, new Reader(declaration, options));
      }
    }

    const hasReaders = readers.size > 0;
    if (hasReaders) {
      outputs.push(
        ...group.lower({
          options,
          computed,
          readers,
          reading: member => readerFor({
            readers,
            member
          })
        })
      );
    }
  }

  for (const declaration of computed.values()) {
    const isUnknown = !knownMembers.has(declaration.property) && !declaration.property.startsWith("--");
    if (isUnknown) {
      options.report({
        severity: "error",
        message: `${declaration.property} has no WinUI meaning (${options.explainUnsupported?.(declaration.property) ?? "no WinUI counterpart"})`,
        position: declaration.at
      });
    }
  }

  return collect(outputs);
}

// Where two outputs set one property, the later wins.
function collect(outputs: Output[]) {
  const style: LoweredStyle = {
    basedOn: null,
    setters: [],
    writes: []
  };
  const setters = new Map<string, Extract<Output, { kind: "setter" | "content" }>>();
  for (const output of outputs) {
    const isBasedOn = output.kind === "basedOn";
    if (isBasedOn) {
      style.basedOn = output.key;
    } else if (output.kind === "write") {
      style.writes.push(output);
    } else if (output.kind === "setter" && COMPOSITION_PROPERTIES.has(output.property)) {
      style.writes = style.writes.filter(write => write.target !== output.property);
      style.writes.push({
        kind: "write",
        target: output.property,
        value: output.value
      });
    } else {
      setters.delete(output.property);
      setters.set(output.property, output);
    }
  }

  style.setters = [...setters.values()];
  return style;
}
