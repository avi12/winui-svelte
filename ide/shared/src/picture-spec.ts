import raw from "../../picture-previews.spec.json" with { type: "json" };
import { z } from "zod";

// The tables of ide/picture-previews.spec.json, which the WebStorm plugin loads as a resource: the image
// formats and their signatures, the schemes and aliases a picture is named with, the size limits, the remote
// policy and the taskbar backgrounds.

const tablesSchema = z.object({
  formats: z.array(
    z.object({
      extension: z.string(),
      mime: z.string()
    })
  ),
  schemes: z.object({
    appx: z.string(),
    file: z.string(),
    data: z.string(),
    remote: z.array(z.string())
  }),
  signatures: z.array(
    z.object({
      extension: z.string(),
      offset: z.number(),
      hex: z.string()
    })
  ),
  aliases: z.array(
    z.object({
      prefix: z.string(),
      folder: z.string()
    })
  ),
  publicFolder: z.string(),
  limits: z.object({
    maxFileBytes: z.number(),
    inlineSize: z.number(),
    hoverSize: z.number()
  }),
  remote: z.object({
    maxBytes: z.number(),
    timeoutMillis: z.number(),
    maxAgeHours: z.number(),
    cacheFolder: z.string(),
    maxRedirects: z.number(),
    failureRetryMinutes: z.number(),
    maxConcurrent: z.number(),
    maxUrlLength: z.number()
  }),
  backgrounds: z.object({
    light: z.string(),
    dark: z.string()
  })
});

/**
 * The shared tables of the picture previews.
 */
export const pictureTables = tablesSchema.parse(raw.tables);
