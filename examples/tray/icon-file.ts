import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const SIZE = 16;
const BITS_PER_BYTE = 8;
const BYTES_PER_PIXEL = 4;
const OPAQUE = 255;
const DIRECTORY_BYTES = 22;
const HEADER_BYTES = 40;
const MASK_ROW_BYTES = 4;
const MASK_BYTES = SIZE * MASK_ROW_BYTES;
const PIXEL_BYTES = SIZE * SIZE * BYTES_PER_PIXEL;
const ICON_TYPE = 1;
const ONE_IMAGE = 1;
const ONE_PLANE = 1;
const BITS_PER_PIXEL = BYTES_PER_PIXEL * BITS_PER_BYTE;
const HEADER_WIDTH_AT = 4;
const HEADER_HEIGHT_AT = 8;
const HEADER_PLANES_AT = 12;
const HEADER_BITS_AT = 14;
const HEADER_IMAGE_BYTES_AT = 20;
const DIRECTORY_TYPE_AT = 2;
const DIRECTORY_COUNT_AT = 4;
const DIRECTORY_WIDTH_AT = 6;
const DIRECTORY_HEIGHT_AT = 7;
const DIRECTORY_PLANES_AT = 10;
const DIRECTORY_BITS_AT = 12;
const DIRECTORY_BYTES_AT = 14;
const DIRECTORY_OFFSET_AT = 18;

// A 16 by 16 square of one color as an .ico file, so the example needs no
// binary asset. Returns the file's path.
export function writeIconFile({ name, red, green, blue }: {
  name: string;
  red: number;
  green: number;
  blue: number;
}) {
  const image = Buffer.alloc(HEADER_BYTES + PIXEL_BYTES + MASK_BYTES);
  image.writeUInt32LE(HEADER_BYTES, 0);
  image.writeInt32LE(SIZE, HEADER_WIDTH_AT);
  image.writeInt32LE(SIZE * 2, HEADER_HEIGHT_AT);
  image.writeUInt16LE(ONE_PLANE, HEADER_PLANES_AT);
  image.writeUInt16LE(BITS_PER_PIXEL, HEADER_BITS_AT);
  image.writeUInt32LE(PIXEL_BYTES + MASK_BYTES, HEADER_IMAGE_BYTES_AT);
  for (let i = 0; i < SIZE * SIZE; i++) {
    image.set([blue, green, red, OPAQUE], HEADER_BYTES + i * BYTES_PER_PIXEL);
  }

  const directory = Buffer.alloc(DIRECTORY_BYTES);
  directory.writeUInt16LE(ICON_TYPE, DIRECTORY_TYPE_AT);
  directory.writeUInt16LE(ONE_IMAGE, DIRECTORY_COUNT_AT);
  directory.writeUInt8(SIZE, DIRECTORY_WIDTH_AT);
  directory.writeUInt8(SIZE, DIRECTORY_HEIGHT_AT);
  directory.writeUInt16LE(ONE_PLANE, DIRECTORY_PLANES_AT);
  directory.writeUInt16LE(BITS_PER_PIXEL, DIRECTORY_BITS_AT);
  directory.writeUInt32LE(image.length, DIRECTORY_BYTES_AT);
  directory.writeUInt32LE(DIRECTORY_BYTES, DIRECTORY_OFFSET_AT);
  const folder = path.join(tmpdir(), "winui-svelte-tray-example");
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, `${name}.ico`);
  writeFileSync(file, Buffer.concat([directory, image]));
  return file;
}
