// The state protocol: a ProtocolMap (messaging/) keyed by the message types
// below. Over any transport (transports/) it is the frames messaging/ defines,
// one JSON value per message, in order:
//
//   host   -> window  snapshot  the whole value of a named state
//                     patch     changes to it, applied in place
//   window -> host    action    something the user did; its answer is the
//                     promise: resolved when the host did it, rejected with
//                     the host's error text when it could not
//
// Data is checked by the zod schemas below; a message that fails them
// is answered with an error and reported, never thrown into the transport's
// loop.

import { jsonSchema } from "#src/messaging/json.js";
import type { Json } from "#src/messaging/json.js";
import type { ProtocolWithReturn } from "#src/messaging/protocol-map.js";
import { z } from "zod";

export type { Json };

const pathSegmentSchema = z.union([z.string(), z.int()]);

/** One step of a path into a value: an object key, or an array index. */
export type PathSegment = z.infer<typeof pathSegmentSchema>;

/** The state protocol's message types, as they are named on the wire. */
export const MessageType = {
  snapshot: "snapshot",
  patch: "patch",
  action: "action"
} as const;

/** The kinds of change a patch holds. */
export const PatchOperation = {
  // Sets the value at `path` (an object key, an array index, or the root
  // when the path is empty).
  set: "set",
  // Removes an object key; for an array index, removes that element.
  remove: "remove",
  // Array only: removes `deleteCount` elements at `start`, inserts `items`.
  splice: "splice"
} as const;

const pathSchema = z.array(pathSegmentSchema);
const countSchema = z.int().nonnegative();

const patchOpSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal(PatchOperation.set),
    path: pathSchema,
    value: jsonSchema
  }),
  z.object({
    op: z.literal(PatchOperation.remove),
    path: pathSchema
  }),
  z.object({
    op: z.literal(PatchOperation.splice),
    path: pathSchema,
    start: countSchema,
    deleteCount: countSchema,
    items: z.array(jsonSchema)
  })
]);

/** A snapshot message's data: the whole value of a named state. */
export const snapshotDataSchema = z.object({
  name: z.string(),
  value: jsonSchema
});

/** A patch message's data: changes to a named state, applied in order. */
export const patchDataSchema = z.object({
  name: z.string(),
  ops: z.array(patchOpSchema)
});

/** One change in a patch, as `PatchOperation` names its kind. */
export type PatchOp = z.infer<typeof patchOpSchema>;

/** The data of a snapshot message. */
export type SnapshotData = z.infer<typeof snapshotDataSchema>;

/** The data of a patch message. */
export type PatchData = z.infer<typeof patchDataSchema>;

/**
 * The messages of the state protocol, as a ProtocolMap. `Action` is the app's
 * own action type (Edge+ generates it from Rust).
 */
export interface StateProtocol<Action extends Json = Json> {
  [MessageType.snapshot]: ProtocolWithReturn<SnapshotData, void>;
  [MessageType.patch]: ProtocolWithReturn<PatchData, void>;
  [MessageType.action]: ProtocolWithReturn<Action, void>;
}

/** Whether `value` is a JSON object: not an array, and not `null`. */
export function isJsonObject(value: Json | undefined): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The type of a state the host owns: a JSON value, or an object type such as
 * an `interface`, which TypeScript does not take for JSON because it has no
 * index signature. The channel checks the value is JSON when it arrives.
 */
export type StateShape = Json | object;
