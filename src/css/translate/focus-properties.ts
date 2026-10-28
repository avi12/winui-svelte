import { setter } from "./property-kit.ts";
import type { GroupInput, Output } from "./property-kit.ts";
import type { Reader } from "#src/css/parse/reader.js";

/** The members `outline` is lowered from. */
export const OUTLINE_MEMBERS = ["outline-width", "outline-style", "outline-color", "outline-offset"];

const VISIBLE_STYLES = new Set(["solid", "auto"]);

function thickness(pixels: number) {
  return `${pixels},${pixels},${pixels},${pixels}`;
}

function focusVisualThickness({ name, pixels }: {
  name: "Primary" | "Secondary";
  pixels: number;
}) {
  return setter({
    property: `FocusVisual${name}Thickness`,
    value: thickness(pixels)
  });
}

// The value of a longhand that is there: null when it is not or was reported.
function valueOf({ reader, parse }: {
  reader: Reader | undefined;
  parse(reader: Reader, word: string): string | number | null;
}) {
  const isUnset = reader === undefined;
  if (isUnset) {
    return null;
  }

  const word = reader.single();
  const isWordMissing = word === null;
  return isWordMissing ? null : parse(reader, word);
}

function pixelsOf(reader: Reader | undefined) {
  const pixels = valueOf({
    reader,
    parse: (source, word) => source.pixels(word)
  });
  return typeof pixels === "number" ? pixels : null;
}

function brushOf(reader: Reader | undefined) {
  const brush = valueOf({
    reader,
    parse: (source, word) => source.brush(word)
  });
  return typeof brush === "string" ? brush : null;
}

/**
 * `outline`: the control's focus visual. The color is the primary brush, the
 * width its thickness and the offset its margin (CSS draws outside the border
 * box, and a negative WinUI margin pushes the focus visual outward);
 * `outline: none` removes the focus visual. A WinUI focus visual is two rings,
 * so the secondary one is switched off to leave CSS's single ring. The focus
 * visual draws only when the control uses the system's, which the runtime sets
 * (a write, since a Style can set it on a Control and not on other types).
 */
export function outline(input: GroupInput) {
  const style = input.readers.get("outline-style")?.declaration.value.toLowerCase() ?? "";
  const width = pixelsOf(input.readers.get("outline-width"));
  const brush = brushOf(input.readers.get("outline-color"));
  const offset = pixelsOf(input.readers.get("outline-offset"));
  const isHidden = style === "none";
  if (isHidden) {
    return [
      focusVisualThickness({
        name: "Primary",
        pixels: 0
      }),
      focusVisualThickness({
        name: "Secondary",
        pixels: 0
      })
    ];
  }

  const outputs: Output[] = [];
  const hasWidth = width !== null;
  if (hasWidth) {
    outputs.push(
      focusVisualThickness({
        name: "Primary",
        pixels: width
      })
    );
  }

  const hasBrush = brush !== null;
  if (hasBrush) {
    outputs.push(
      setter({
        property: "FocusVisualPrimaryBrush",
        value: brush
      })
    );
  }

  const hasOffset = offset !== null;
  if (hasOffset) {
    outputs.push(
      setter({
        property: "FocusVisualMargin",
        value: thickness(-offset)
      })
    );
  }

  const isVisible = outputs.length > 0 || VISIBLE_STYLES.has(style);
  if (!isVisible) {
    return [];
  }

  return [
    ...outputs,
    focusVisualThickness({
      name: "Secondary",
      pixels: 0
    }),
    {
      kind: "write",
      target: "focusVisuals",
      value: "true"
    } as const
  ];
}
