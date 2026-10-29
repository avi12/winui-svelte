import { DataWriter } from "#winui/windows/storage/streams/DataWriter";
import { InMemoryRandomAccessStream } from "#winui/windows/storage/streams/InMemoryRandomAccessStream";

const START = 0n;

/** A WinRT stream holding the bytes, at its start: what WinRT decoders (images, Win2D bitmaps) read. */
export async function streamOf(bytes: Uint8Array) {
  const stream = new InMemoryRandomAccessStream();
  const writer = new DataWriter(stream);
  writer.writeBytes(bytes);
  await writer.storeAsync();
  writer.detachStream();
  stream.seek(START);
  return stream;
}
