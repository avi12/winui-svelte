import type { ImageData } from "#src/win2d/context-2d/image-data.js";
import { crc32, deflateSync } from "node:zlib";

// A PNG file from RGBA pixels, synchronously: toDataURL returns a string, and
// every WinRT encoder is asynchronous.

const SIGNATURE = "\x89PNG\r\n\x1a\n";
const CHANNELS = 4;
const BIT_DEPTH = 8;
const COLOR_TYPE_RGBA = 6;
const NO_FILTER = 0;
const LENGTH_BYTES = 4;
const HEADER_BYTES = 13;
const WIDTH_AT = 0;
const HEIGHT_AT = 4;
const BIT_DEPTH_AT = 8;
const COLOR_TYPE_AT = 9;

function chunk({ name, body }: {
  name: string;
  body: Uint8Array;
}) {
  const bytes = Buffer.alloc(LENGTH_BYTES + name.length + body.length + LENGTH_BYTES);
  bytes.writeUInt32BE(body.length, 0);
  bytes.write(name, LENGTH_BYTES, "latin1");
  bytes.set(body, LENGTH_BYTES + name.length);
  const checked = bytes.subarray(LENGTH_BYTES, LENGTH_BYTES + name.length + body.length);
  bytes.writeUInt32BE(crc32(checked), bytes.length - LENGTH_BYTES);
  return bytes;
}

/**
 * The bytes of a PNG file (8-bit RGBA, straight alpha) holding the image.
 *
 * @param image - The pixels.
 * @returns The file's bytes.
 */
export function pngBytesOf(image: ImageData) {
  const header = Buffer.alloc(HEADER_BYTES);
  header.writeUInt32BE(image.width, WIDTH_AT);
  header.writeUInt32BE(image.height, HEIGHT_AT);
  header.writeUInt8(BIT_DEPTH, BIT_DEPTH_AT);
  header.writeUInt8(COLOR_TYPE_RGBA, COLOR_TYPE_AT);
  const rowLength = image.width * CHANNELS;
  const scanlines = Buffer.alloc((rowLength + 1) * image.height);
  for (let row = 0; row < image.height; row++) {
    scanlines.writeUInt8(NO_FILTER, row * (rowLength + 1));
    scanlines.set(image.data.subarray(row * rowLength, (row + 1) * rowLength), row * (rowLength + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from(SIGNATURE, "latin1"),
    chunk({
      name: "IHDR",
      body: header
    }),
    chunk({
      name: "IDAT",
      body: deflateSync(scanlines)
    }),
    chunk({
      name: "IEND",
      body: new Uint8Array()
    })
  ]);
}
