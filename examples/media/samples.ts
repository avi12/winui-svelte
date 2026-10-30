import { crc32, deflateSync } from "node:zlib";

// Media made in memory, so the example and its test need no files: a PNG, an
// SVG and a short WAV.

const PNG_SIGNATURE = Buffer.from("89504e470d0a1a0a", "hex");
const PNG_HEADER_TAIL = Buffer.from("0806000000", "hex");
const CHANNELS = 4;
const WORD_BYTES = 4;
const HALF_WORD_BYTES = 2;
const WAV_FORMAT_PCM = 1;
const WAV_FORMAT_CHUNK_BYTES = 16;
const WAV_HEADER_AFTER_RIFF_BYTES = 36;
const WAV_BITS = 16;
const WAV_RATE = 22_050;
const WAV_BYTES_PER_SAMPLE = 2;
const MILLISECONDS_PER_SECOND = 1000;
const SINE_HERTZ = 440;
const SINE_AMPLITUDE = 8000;

/** One pixel, each channel from 0 to 255. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

function bigEndian(value: number) {
  const word = Buffer.alloc(WORD_BYTES);
  word.writeUInt32BE(value);
  return word;
}

function littleEndian({ value, bytes }: {
  value: number;
  bytes: number;
}) {
  const field = Buffer.alloc(bytes);
  field.writeUIntLE(value, 0, bytes);
  return field;
}

function chunk({ type, data }: {
  type: string;
  data: Uint8Array;
}) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  return Buffer.concat([bigEndian(data.length), body, bigEndian(crc32(body))]);
}

/** A PNG whose left half is `left` and right half `right`. */
export function twoColorPng({ width, height, left, right }: {
  width: number;
  height: number;
  left: Rgba;
  right: Rgba;
}) {
  const rowBytes = 1 + width * CHANNELS;
  const raw = Buffer.alloc(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { r, g, b, a } = x < width / 2 ? left : right;
      raw.set([r, g, b, a], y * rowBytes + 1 + x * CHANNELS);
    }
  }

  const header = Buffer.concat([bigEndian(width), bigEndian(height), PNG_HEADER_TAIL]);
  return new Uint8Array(Buffer.concat([
    PNG_SIGNATURE,
    chunk({
      type: "IHDR",
      data: header
    }),
    chunk({
      type: "IDAT",
      data: deflateSync(raw)
    }),
    chunk({
      type: "IEND",
      data: new Uint8Array()
    })
  ]));
}

/** SVG markup of two side by side squares, `size` pixels high. */
export function twoColorSvg({ size, left, right }: {
  size: number;
  left: string;
  right: string;
}) {
  const half = size / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`
    + `<rect width="${half}" height="${size}" fill="${left}"/>`
    + `<rect x="${half}" width="${half}" height="${size}" fill="${right}"/></svg>`;
}

/** A mono 16-bit WAV of a sine tone, `milliseconds` long. */
export function sineWav(milliseconds: number) {
  const samples = Math.round(WAV_RATE * milliseconds / MILLISECONDS_PER_SECOND);
  const pcm = Buffer.alloc(samples * WAV_BYTES_PER_SAMPLE);
  for (let i = 0; i < samples; i++) {
    const angle = 2 * Math.PI * SINE_HERTZ * i / WAV_RATE;
    pcm.writeInt16LE(Math.round(SINE_AMPLITUDE * Math.sin(angle)), i * WAV_BYTES_PER_SAMPLE);
  }

  return new Uint8Array(Buffer.concat([
    Buffer.from("RIFF", "ascii"),
    littleEndian({
      value: WAV_HEADER_AFTER_RIFF_BYTES + pcm.length,
      bytes: WORD_BYTES
    }),
    Buffer.from("WAVEfmt ", "ascii"),
    littleEndian({
      value: WAV_FORMAT_CHUNK_BYTES,
      bytes: WORD_BYTES
    }),
    littleEndian({
      value: WAV_FORMAT_PCM,
      bytes: HALF_WORD_BYTES
    }),
    littleEndian({
      value: 1,
      bytes: HALF_WORD_BYTES
    }),
    littleEndian({
      value: WAV_RATE,
      bytes: WORD_BYTES
    }),
    littleEndian({
      value: WAV_RATE * WAV_BYTES_PER_SAMPLE,
      bytes: WORD_BYTES
    }),
    littleEndian({
      value: WAV_BYTES_PER_SAMPLE,
      bytes: HALF_WORD_BYTES
    }),
    littleEndian({
      value: WAV_BITS,
      bytes: HALF_WORD_BYTES
    }),
    Buffer.from("data", "ascii"),
    littleEndian({
      value: pcm.length,
      bytes: WORD_BYTES
    }),
    pcm
  ]));
}
