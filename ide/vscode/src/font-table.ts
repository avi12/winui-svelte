import raw from "../../webstorm/src/main/resources/font-family-props.json" with { type: "json" };
import { listsProp, typedPropsTableSchema } from "./typed-props-table.ts";

const table = typedPropsTableSchema.parse(raw);

/**
 * Whether WinUI's own component takes a font family in the prop (`fontFamily` on a `TextBlock`).
 */
export function isFontFamilyAttribute({ tag, attribute }: {
  tag: string;
  attribute: string;
}) {
  return listsProp({
    table,
    tag,
    attribute
  });
}
