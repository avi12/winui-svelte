import { z } from "zod";

// WebStorm drops the whole web-types file, and every hover with it, when it
// does not follow its schema: the generator checks what it writes and the test
// reads it back through the same schema.

const typeReferenceSchema = z.union([z.string(), z.strictObject({
  module: z.string(),
  name: z.string()
})]);

export const webTypesSchema = z.object({
  contributions: z.object({
    html: z.object({
      elements: z.array(
        z.object({
          name: z.string(),
          extends: z.string().optional(),
          attributes: z.array(
            z.object({
              name: z.string(),
              description: z.string().optional(),
              value: z.strictObject({
                kind: z.literal("expression").optional(),
                type: z.union([typeReferenceSchema, z.array(typeReferenceSchema)])
              }).optional()
            })
          )
        })
      )
    }),
    css: z.object({
      properties: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          values: z.array(z.string()).optional()
        })
      )
    })
  })
});
