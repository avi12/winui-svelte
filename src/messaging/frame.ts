import { jsonSchema } from "./json.ts";
import { z } from "zod";

const identifierSchema = z.int().nonnegative();

/**
 * A request as it travels over a transport, as @webext-core/messaging's
 * frames do: `{ id, type, data, timestamp }`. A frame with a `type` is a
 * request.
 */
export const requestFrameSchema = z.object({
  id: identifierSchema,
  type: z.string(),
  data: jsonSchema.optional(),
  timestamp: z.number().optional()
});

/**
 * The answer to the request with the same `id`: `{ id, response }` or
 * `{ id, error }`. A frame without a `type` is a response.
 */
export const responseFrameSchema = z.object({
  id: identifierSchema,
  // A response has no type: that is what tells it from a request.
  type: z.undefined().optional(),
  response: jsonSchema.optional(),
  // Null or absent when the handler returned.
  error: z.string().nullish()
});

/** A request frame, as `requestFrameSchema` parses it. */
export type RequestFrame = z.infer<typeof requestFrameSchema>;

/** A response frame, as `responseFrameSchema` parses it. */
export type ResponseFrame = z.infer<typeof responseFrameSchema>;

/** Both kinds: what a link carries for messaging. */
export type Frame = RequestFrame | ResponseFrame;
