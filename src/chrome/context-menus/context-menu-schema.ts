import { ContextItemType, ContextType } from "./context-menu-types.ts";
import type { OnClickData } from "./context-menu-types.ts";
import { z } from "zod";

const callbackSchema = z.custom<(info: OnClickData) => void>(value => typeof value === "function");

const updateSchema = z.strictObject({
  type: z.enum(Object.values(ContextItemType)).optional(),
  title: z.string().optional(),
  checked: z.boolean().optional(),
  contexts: z.array(z.enum(Object.values(ContextType))).min(1).optional(),
  visible: z.boolean().optional(),
  enabled: z.boolean().optional(),
  parentId: z.union([z.string(), z.number()]).optional(),
  onclick: callbackSchema.optional(),
  documentUrlPatterns: z.array(z.string()).optional(),
  targetUrlPatterns: z.array(z.string()).optional()
});

const createSchema = updateSchema.extend({ id: z.string().min(1).optional() });

function parseOrThrow<T>({ schema, input }: {
  schema: z.ZodType<T>;
  input: unknown;
}) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues.map(issue => issue.message).join("; "));
  }

  return result.data;
}

/** Checks the properties of `create` against Chrome's shape; throws an `Error` for an unknown key or a wrong type. */
export function parseCreate(input: unknown) {
  return parseOrThrow({
    schema: createSchema,
    input
  });
}

/** Checks the properties of `update` against Chrome's shape; `id` is an unknown key there. */
export function parseUpdate(input: unknown) {
  return parseOrThrow({
    schema: updateSchema,
    input
  });
}
