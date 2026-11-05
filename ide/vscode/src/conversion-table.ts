import raw from "../../webstorm/src/main/resources/winui-css-mappings.json" with { type: "json" };
import { z } from "zod";

export const MappingKind = {
  KEYWORD: "keyword",
  LENGTH: "length",
  NUMBER: "number",
  COLOR: "color",
  THICKNESS: "thickness",
  CORNER_RADIUS: "cornerRadius",
  TEXT: "text",
  UNSUPPORTED: "unsupported"
} as const;
export type MappingKind = (typeof MappingKind)[keyof typeof MappingKind];

const mappingSchema = z.object({
  cssProperty: z.string(),
  kind: z.string(),
  enumTypes: z.array(z.string()),
  keywords: z.record(z.string(), z.string()).optional(),
  defaultValue: z.string().optional()
});
const table = z.object({ attributes: z.record(z.string(), mappingSchema) }).parse(raw).attributes;

/**
 * How a prop converts to CSS: the property, the kind of value, and the words of a keyword prop.
 */
export type Mapping = NonNullable<ReturnType<typeof mappingOf>>;

/**
 * Every prop that has a CSS counterpart, by its name, with the kind of value it converts.
 */
export function mappingEntries() {
  return Object.entries(table);
}

/**
 * How a prop converts to CSS, or undefined when it has no counterpart or none that converts safely.
 */
export function mappingOf(attribute: string) {
  const mapping = table[attribute];
  const isConvertible = mapping !== undefined && mapping.kind !== MappingKind.UNSUPPORTED;
  return isConvertible ? {
    ...mapping,
    keywords: new Map(Object.entries(mapping.keywords ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
  } : undefined;
}
