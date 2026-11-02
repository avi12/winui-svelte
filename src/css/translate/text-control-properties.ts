import { discreteGroup } from "./discrete-properties.ts";
import { enumMap, multiple, setter } from "./property-kit.ts";
import type { PropertyGroup } from "./property-kit.ts";
import { parseNumber } from "#src/css/parse/values.js";

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

/** The groups of `font-stretch`, `direction`, `background-clip` and `tab-index`. */
export const textControlGroups: readonly PropertyGroup[] = [
  discreteGroup("font-stretch"),
  discreteGroup("direction"),
  backgroundClip,
  tabIndex
];
