import raw from "../../webstorm/src/main/resources/winui-ide-data.json" with { type: "json" };
import { mappingEntries, MappingKind } from "./conversion-table.ts";
import { z } from "zod";

const easingSchema = z.object({
  name: z.string(),
  kind: z.enum(["bezier", "steps"]),
  points: z.array(z.number()).optional(),
  count: z.number().optional(),
  jump: z.string().optional()
});
const dataSchema = z.object({
  easings: z.array(easingSchema),
  shadowDepths: z.array(
    z.object({
      depth: z.number(),
      use: z.string()
    })
  ),
  unsupportedProperties: z.array(
    z.object({
      name: z.string(),
      reason: z.string()
    })
  ),
  materials: z.array(
    z.object({
      name: z.string(),
      light: z.string(),
      dark: z.string(),
      isTranslucent: z.boolean()
    })
  ),
  translateKeys: z.array(z.string())
});
const data = dataSchema.parse(raw);
const unsupported = new Map(data.unsupportedProperties.map(property => [property.name, property.reason]));
const handled = new Set(data.translateKeys);
const targets = new Map<string, string[]>();
for (const [, mapping] of mappingEntries()) {
  const isConvertible = mapping.kind !== MappingKind.UNSUPPORTED;
  if (isConvertible) {
    targets.set(mapping.cssProperty, [...targets.get(mapping.cssProperty) ?? [], mapping.winuiProperty]);
  }
}

/**
 * The named easings (`ease`, `step-end`) and the curves they draw.
 */
export function namedEasings() {
  return data.easings;
}

/**
 * The shadow depths WinUI uses, shallow to deep, with what each is for.
 */
export function shadowDepths() {
  return data.shadowDepths;
}

/**
 * The window materials (`mica`, `acrylic`) with the light and dark color each shows.
 */
export function materials() {
  return data.materials;
}

/**
 * The reason a CSS property has no WinUI meaning, for every property the library names one for.
 */
export function unsupportedReasons() {
  return unsupported;
}

/**
 * The WinUI properties a CSS property sets (`border-radius` sets `CornerRadius`).
 */
export function winuiTargets() {
  return targets;
}

/**
 * Whether the CSS translation handles a property.
 */
export function isHandledProperty(property: string) {
  return handled.has(property);
}
