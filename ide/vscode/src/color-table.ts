import { mappingEntries, MappingKind } from "./conversion-table.ts";

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
const colorEntries = mappingEntries().filter(([, mapping]) => mapping.kind === MappingKind.COLOR);
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
