import raw from "../../webstorm/src/main/resources/font-family-props.json" with { type: "json" };
import { z } from "zod";

const table = z.object({ attributes: z.record(z.string(), z.array(z.string())) }).parse(raw);

/**
 * Whether WinUI's own component takes a font family in the prop (`fontFamily` on a `TextBlock`).
 */
export function isFontFamilyAttribute({ tag, attribute }: {
  tag: string;
  attribute: string;
}) {
  return table.attributes[tag]?.includes(attribute) === true;
}
