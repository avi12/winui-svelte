import { z } from "zod";

/** The most bytes of one redirect message a first copy reads; a larger one is dropped. */
export const MAX_REDIRECT_BYTES = 65_536;

const MAX_ARGUMENTS = 1024;

const redirectSchema = z.object({
  arguments: z.array(z.string()).max(MAX_ARGUMENTS),
  workingDirectory: z.string()
});

/** What a later copy was started with, which it hands to the first copy. */
export type Activation = z.infer<typeof redirectSchema>;

/**
 * Writes an activation as the one JSON line a later copy sends.
 *
 * @param activation - The command line arguments and working directory.
 * @returns The line, without its newline.
 * @throws {Error} When it is larger than `MAX_REDIRECT_BYTES`.
 */
export function encodeRedirect(activation: Activation) {
  const line = JSON.stringify(redirectSchema.parse(activation));
  const isTooLarge = Buffer.byteLength(line) > MAX_REDIRECT_BYTES;
  if (isTooLarge) {
    throw new Error(`the redirect is larger than ${MAX_REDIRECT_BYTES} bytes`);
  }

  return line;
}

/**
 * Reads what arrived on the pipe: a value that is not an activation is not
 * one, and nothing in it is ever run.
 *
 * @param value - A parsed JSON value.
 * @returns The activation, or `undefined` when the value is not one.
 */
export function decodeRedirect(value: unknown) {
  const parsed = redirectSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}
