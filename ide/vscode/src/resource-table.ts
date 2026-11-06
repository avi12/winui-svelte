import raw from "../../webstorm/src/main/resources/winui-ide-data.json" with { type: "json" };
import { z } from "zod";

const resourceSchema = z.object({
  name: z.string(),
  property: z.string(),
  kind: z.string(),
  light: z.string().optional(),
  dark: z.string().optional()
});
const tableSchema = z.object({ resources: z.array(resourceSchema) });
const table = tableSchema.parse(raw);
const byProperty = new Map(table.resources.map(resource => [resource.property, resource]));

/**
 * Every WinUI resource a `var(--name)` can name, with the color it shows in the light and the dark theme where it
 * has one.
 */
export function winuiResources() {
  return table.resources;
}

/**
 * The resource a custom property such as `--card-background-fill-color-default` names, or undefined for a property
 * of the app's own.
 */
export function resourceOfProperty(property: string) {
  return byProperty.get(property);
}
