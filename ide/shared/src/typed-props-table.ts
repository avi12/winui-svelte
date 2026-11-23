import { z } from "zod";

/**
 * The shape of a generated table of the props of each component that take one input type.
 */
export const typedPropsTableSchema = z.object({ attributes: z.record(z.string(), z.array(z.string())) });

/**
 * Whether the table lists the prop for the component.
 */
export function listsProp({ table, tag, attribute }: {
  table: z.infer<typeof typedPropsTableSchema>;
  tag: string;
  attribute: string;
}) {
  return table.attributes[tag]?.includes(attribute) === true;
}
