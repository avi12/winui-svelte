import { ALL_URLS } from "./permission-table.ts";
import { z } from "zod";

const MATCH_PATTERN = /^(?:\*|https?|file|ftp|urn):\/\/(?:\*|\*\.[^/*]+|[^/*]*)\/.*$/u;

const originSchema = z.string().refine(
  value => value === ALL_URLS || MATCH_PATTERN.test(value),
  { error: issue => `'${String(issue.input)}' is not a valid match pattern` }
);

const permissionsSchema = z.object({
  permissions: z.array(z.string()).optional(),
  origins: z.array(originSchema).optional()
});

const requestSchema = permissionsSchema.extend({ openSettings: z.boolean().optional() });

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

const storedSchema = z.object({ granted: z.array(z.string()) });

/** The names and origins of a chrome.permissions call, checked and with the defaults filled in. */
export function parsePermissions(input: unknown) {
  const parsed = parseOrThrow({
    schema: permissionsSchema,
    input
  });
  return {
    permissions: parsed.permissions ?? [],
    origins: parsed.origins ?? []
  };
}

/** The same with the `openSettings` extra of `request`. */
export function parseRequest(input: unknown) {
  const parsed = parseOrThrow({
    schema: requestSchema,
    input
  });
  return {
    permissions: parsed.permissions ?? [],
    origins: parsed.origins ?? [],
    isOpeningSettings: parsed.openSettings === true
  };
}

/**
 * Reads the saved file.
 *
 * @param text - The file's text, or undefined when there is none.
 * @returns The names granted; empty for a missing or damaged file.
 */
export function parseStored(text: string | undefined) {
  const isMissing = text === undefined;
  if (isMissing) {
    return [];
  }

  try {
    const result = storedSchema.safeParse(JSON.parse(text));
    return result.success ? result.data.granted : [];
  } catch {
    return [];
  }
}
