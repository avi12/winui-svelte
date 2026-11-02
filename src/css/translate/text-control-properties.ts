import { alignmentProperty } from "./layout-properties.ts";
import { enumMap, keywordProperty, multiple, setter } from "./property-kit.ts";
import type { PropertyGroup } from "./property-kit.ts";
import { parseNumber } from "#src/css/parse/values.js";

/** `font-stretch`, as the Windows.UI.Text.FontStretch of a control or text element. */
const FONT_STRETCHES = "ultra-condensed extra-condensed condensed semi-condensed normal semi-expanded expanded"
  + " extra-expanded ultra-expanded";
const fontStretches = enumMap(
  FONT_STRETCHES.split(" ").map(word => [
    word,
    word.replaceAll(/(?:^|-)([a-z])/gu, (_, letter: string) => letter.toUpperCase())
  ])
);

/** `direction`, as FlowDirection. */
const directions = enumMap([
  ["ltr", "LeftToRight"],
  ["rtl", "RightToLeft"]
]);

/** The keyword properties of the control group: the WinUI property each sets and the value of each keyword. */
export const CONTROL_KEYWORDS = new Map([
  ["font-stretch", {
    property: "FontStretch",
    choices: fontStretches
  }],
  ["direction", {
    property: "FlowDirection",
    choices: directions
  }]
]);

/** `background-clip`: the edge a Background paints to; WinUI has no `text` or `content-box` clip. */
const backgroundClips = enumMap([
  ["border-box", "OuterBorderEdge"],
  ["padding-box", "InnerBorderEdge"]
]);

const backgroundClip = {
  members: ["background-clip"],
  property: "BackgroundSizing",
  lower(input) {
    const reader = input.reading("background-clip");
    const word = reader.single();
    const isWordMissing = word === null;
    if (isWordMissing) {
      return [];
    }

    const value = backgroundClips.get(word.toLowerCase());
    const hasValue = value !== undefined;
    if (hasValue) {
      return [setter({
        property: "BackgroundSizing",
        value
      })];
    }

    reader.expectedToken({
      what: "border-box (OuterBorderEdge) or padding-box (InnerBorderEdge); a WinUI background has no content-box or text clip",
      token: word
    });
    return [];
  }
} satisfies PropertyGroup;

// A negative index takes the control out of the tab order, as tabindex="-1" does.
const tabIndex = multiple({
  member: "tab-index",
  parse(reader) {
    const word = reader.single();
    const isWordMissing = word === null;
    if (isWordMissing) {
      return [];
    }

    const index = parseNumber(word);
    const isIndexInvalid = index === null || !Number.isInteger(index);
    if (isIndexInvalid) {
      reader.expectedToken({
        what: "an integer",
        token: word
      });
      return [];
    }

    const isNegative = index < 0;
    if (isNegative) {
      return [setter({
        property: "IsTabStop",
        value: "False"
      })];
    }

    return [setter({
      property: "TabIndex",
      value: String(index)
    })];
  }
});

/** The members the control groups lower, which a sheet using one opts in for. */
export const CONTROL_MEMBERS = [
  "font-stretch",
  "direction",
  "background-clip",
  "tab-index",
  "align-items",
  "justify-content"
];

/** The groups of the control properties that CONTROL_MEMBERS lists. */
export function controlGroups() {
  return [
    ...[...CONTROL_KEYWORDS].map(([member, spec]) => keywordProperty({
      member,
      ...spec
    })),
    backgroundClip,
    tabIndex,
    alignmentProperty({
      member: "align-items",
      property: "VerticalContentAlignment",
      startName: "Top",
      endName: "Bottom"
    }),
    alignmentProperty({
      member: "justify-content",
      property: "HorizontalContentAlignment",
      startName: "Left",
      endName: "Right"
    })
  ];
}
