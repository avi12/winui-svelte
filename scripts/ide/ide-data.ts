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

const ideDataSchema = z.strictObject({
  resources: z.array(resourceSchema),
  enums: z.array(enumSchema),
  attachments: z.array(attachmentSchema),
  webEvents: z.array(webEventSchema),
  translateKeys: z.array(z.string())
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
