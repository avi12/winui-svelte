import type { Json } from "#src/messaging/json.js";
import { jsonSchema } from "#src/messaging/json.js";

const HEADER_BYTES = 4;
const BYTES_PER_KIBIBYTE = 1024;

/** The most a host may send in one message: Chrome's own limit, 1 MiB. */
export const MAX_HOST_MESSAGE_BYTES = BYTES_PER_KIBIBYTE * BYTES_PER_KIBIBYTE;

/** What goes wrong reading a native host's output: a message too large, or not JSON. */
export class NativeMessageError extends Error {
  override readonly name: string = "NativeMessageError";
}

/**
 * Frames a message the way the native messaging protocol does: the length of
 * the UTF-8 JSON in four bytes (the machine's byte order, little-endian on
 * every Windows CPU), then the JSON.
 *
 * @param message - A JSON value.
 * @returns The bytes to write to the host's stdin.
 */
export function encodeNativeMessage(message: Json) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

/** Reads framed messages out of a host's stdout, however the chunks fall. */
export class NativeMessageDecoder {
  private pending = Buffer.alloc(0);
  private readonly maxBytes: number;

  constructor({ maxBytes = MAX_HOST_MESSAGE_BYTES }: { maxBytes?: number } = {}) {
    this.maxBytes = maxBytes;
  }

  /**
   * Adds a chunk and returns every message it completed.
   *
   * @param chunk - Bytes read from the host.
   * @returns The messages, in order; none while one is still incomplete.
   * @throws {NativeMessageError} When a message is larger than the limit or
   *   is not JSON; the stream cannot be trusted after that.
   */
  push(chunk: Buffer) {
    this.pending = Buffer.concat([this.pending, chunk]);
    const messages: Json[] = [];
    while (this.pending.length >= HEADER_BYTES) {
      const length = this.pending.readUInt32LE(0);
      const isTooLarge = length > this.maxBytes;
      if (isTooLarge) {
        throw new NativeMessageError(`the host sent a message of ${length} bytes, over the limit of ${this.maxBytes}`);
      }

      const end = HEADER_BYTES + length;
      const isIncomplete = this.pending.length < end;
      if (isIncomplete) {
        break;
      }

      const text = this.pending.subarray(HEADER_BYTES, end).toString("utf8");
      this.pending = this.pending.subarray(end);
      messages.push(this.parse(text));
    }

    return messages;
  }

  private parse(text: string) {
    try {
      return jsonSchema.parse(JSON.parse(text));
    } catch {
      throw new NativeMessageError("the host sent a message that is not JSON");
    }
  }
}
