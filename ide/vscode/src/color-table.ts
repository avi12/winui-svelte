import raw from "../../webstorm/src/main/resources/winui-css-mappings.json" with { type: "json" };
import { z } from "zod";

const EXTRA_COLOR_PROPERTIES = [
  "color",
  "fill",
  "stroke",
  "outline-color",
  "caret-color",
  "accent-color",
  "text-decoration-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "column-rule-color"
];
const table = z.object({
  attributes: z.record(z.string(), z.object({
    cssProperty: z.string(),
    kind: z.string()
  }))
}).parse(raw);
const colorEntries = Object.entries(table.attributes).filter(([, mapping]) => mapping.kind === "color");
const colorAttributes = new Set(colorEntries.map(([name]) => name));
const colorProperties = new Set([...EXTRA_COLOR_PROPERTIES, ...colorEntries.map(([, mapping]) => mapping.cssProperty)]);

/**
 * Whether a prop of a component takes a color (`background`).
 */
export function isColorAttribute(attribute: string) {
  return colorAttributes.has(attribute);
}

/**
 * Whether a CSS property takes a color (`color`, `border-color`).
 */
export function isColorProperty(property: string) {
  return colorProperties.has(property);
}
