import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

// The one checked-in data set both editors read (ide/webstorm loads it as a
// resource, ide/vscode imports it) and web-types.json is derived from;
// `scripts/ide/generate-ide-data.ts` writes it.

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");

export const IDE_DATA_FILE = path.join(PACKAGE_ROOT, "ide", "webstorm", "src", "main", "resources", "winui-ide-data.json");

const resourceSchema = z.strictObject({
  name: z.string(),
  property: z.string(),
  kind: z.string(),
  light: z.string().optional(),
  dark: z.string().optional()
});

const enumMemberSchema = z.strictObject({
  name: z.string(),
  value: z.union([z.string(), z.number()]),
  description: z.string().optional()
});

const enumSchema = z.strictObject({
  name: z.string(),
  isNumeric: z.boolean(),
  members: z.array(enumMemberSchema)
});

const attachmentSchema = z.strictObject({
  name: z.string(),
  module: z.string(),
  description: z.string()
});

const webEventSchema = z.strictObject({
  name: z.string(),
  module: z.string(),
  enabledBy: z.string(),
  description: z.string()
});

const easingSchema = z.strictObject({
  name: z.string(),
  kind: z.enum(["bezier", "steps"]),
  points: z.array(z.number()).optional(),
  count: z.number().optional(),
  jump: z.string().optional()
});

const shadowDepthSchema = z.strictObject({
  depth: z.number(),
  use: z.string()
});

const unsupportedPropertySchema = z.strictObject({
  name: z.string(),
  reason: z.string()
});

const materialSchema = z.strictObject({
  name: z.string(),
  light: z.string(),
  dark: z.string(),
  isTranslucent: z.boolean()
});

const pictureFormSchema = z.enum(["string", "pair", "pixels"]);

const picturePropSchema = z.strictObject({
  owner: z.string(),
  name: z.string(),
  forms: z.array(pictureFormSchema),
  components: z.array(z.string())
});

const pictureVariantSchema = z.strictObject({
  name: z.string(),
  theme: z.enum(["light", "dark"])
});

const ideDataSchema = z.strictObject({
  resources: z.array(resourceSchema),
  enums: z.array(enumSchema),
  attachments: z.array(attachmentSchema),
  webEvents: z.array(webEventSchema),
  translateKeys: z.array(z.string()),
  easings: z.array(easingSchema),
  shadowDepths: z.array(shadowDepthSchema),
  unsupportedProperties: z.array(unsupportedPropertySchema),
  materials: z.array(materialSchema),
  pictureProps: z.array(picturePropSchema),
  pictureVariants: z.array(pictureVariantSchema)
});

export type IdeData = z.infer<typeof ideDataSchema>;

/** Reads the checked-in data set. */
export function readIdeData() {
  return ideDataSchema.parse(JSON.parse(readFileSync(IDE_DATA_FILE, "utf8")));
}

/** Checks a data set before it is written. */
export function parsedIdeData(data: IdeData) {
  return ideDataSchema.parse(data);
}
