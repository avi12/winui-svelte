import type { z } from "zod";

/** Checks `input` against `schema`; throws an `Error` naming every issue, as Chrome does for a bad argument. */
export function parseOrThrow<T>({ schema, input }: {
  readonly schema: z.ZodType<T>;
  readonly input: unknown;
}) {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(result.error.issues.map(issue => issue.message).join("; "));
  }

  return result.data;
}
