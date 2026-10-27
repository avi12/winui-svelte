// What the channel needs of a link to the host: JSON values in order each way.
// Each transport (stdio, a worker's MessagePort, in memory) is one small file.

import type { Frame } from "#src/messaging/frame.js";
import type { Json } from "#src/messaging/json.js";

/** Who a transport delivers to: what arrives, what could not be read, and the end of the link. */
export interface TransportListener {
  /** A JSON value arrived. */
  message(value: Json): void;

  /** A line or message that could not be read (not JSON, say). */
  malformed(reason: string): void;

  /** The host is gone: nothing more arrives. */
  closed(): void;
}

/**
 * A link to the host: JSON values in order, each way. `Sent` is what this end
 * sends (messaging's frames by default); what arrives is JSON.
 */
export interface Transport<Sent = Frame> {
  /** Sends a frame to the other end. */
  send(frame: Sent): void;

  /** Starts delivering to `listener`; the returned function stops it. */
  listen(listener: TransportListener): () => void;
}
