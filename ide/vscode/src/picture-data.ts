import raw from "../../webstorm/src/main/resources/winui-ide-data.json" with { type: "json" };
import { z } from "zod";

// The members the library types as a picture (`PictureSource`), which `pnpm gen:ide-data` finds with the checker:
// the previews read only this, so a new picture prop needs no edit here.

const dataSchema = z.object({
  pictureProps: z.array(
    z.object({
      owner: z.string(),
      name: z.string(),
      forms: z.array(z.string()),
      components: z.array(z.string())
    })
  ),
  pictureVariants: z.array(
    z.object({
      name: z.string(),
      theme: z.enum(["light", "dark"])
    })
  )
});
const data = dataSchema.parse(raw);
const names = new Set(data.pictureProps.map(prop => prop.name));
const variants = new Map(data.pictureVariants.map(variant => [variant.name, variant.theme]));
const PICTURE_TYPE = "PictureSource";

/**
 * Every member name that holds a picture: a prop, an option or an object key.
 */
export function pictureNames() {
  return {
    names,
    variants
  };
}

/**
 * Whether the component takes the attribute as a picture.
 */
export function isPictureAttribute({ tag, attribute }: {
  tag: string;
  attribute: string;
}) {
  return data.pictureProps.some(prop => prop.name === attribute && prop.components.includes(tag));
}

/**
 * The type a wrapper component declares a picture prop with, to follow it into the project.
 */
export const WRAPPER_TYPE = PICTURE_TYPE;
