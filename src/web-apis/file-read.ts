import type { ProgressReporter } from "#src/progress/track-operation.js";
import { open } from "node:fs/promises";

const CHUNK_BYTES = 1_048_576;

/**
 * Reads a whole file a chunk at a time, reporting to an operation after each
 * chunk and stopping when its signal aborts.
 *
 * @param options - The path and the operation to report to.
 * @returns The file content.
 * @throws {DOMException} An `AbortError` when the operation is canceled.
 */
export async function readInChunks({ location, operation }: {
  location: string;
  operation: ProgressReporter;
}) {
  const file = await open(location, "r");
  try {
    const { size } = await file.stat();
    operation.update({
      loaded: 0,
      total: size
    });
    const content = Buffer.allocUnsafe(size);
    let offset = 0;
    while (offset < size) {
      operation.signal.throwIfAborted();
      const { bytesRead } = await file.read(content, offset, Math.min(CHUNK_BYTES, size - offset), offset);
      const isEnd = bytesRead === 0;
      if (isEnd) {
        break;
      }

      offset += bytesRead;
      operation.update({ loaded: offset });
    }

    return content.subarray(0, offset);
  } finally {
    await file.close();
  }
}
