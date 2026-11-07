// What the first bytes of a picture file say: its size, and for an .ico the size of every frame. The same rules
// as PictureImages.kt, tested against the same ide/picture-previews.spec.json.

const OFFSET = {
  icoEntries: 6,
  icoEntrySize: 16,
  icoColorDepth: 6,
  icoDataSize: 8,
  icoDataOffset: 12,
  icoCount: 4,
  icoType: 2,
  pngWidth: 16,
  gifWidth: 6,
  bmpWidth: 18,
  webpSize: 24,
  jpegSkipHeader: 2,
  jpegHeight: 5,
  jpegWidth: 7,
  jpegLength: 2,
  jpegMinimumTail: 9
} as const;
const ICO_LARGE = 256;
const WORD = 2;
const DOUBLE_WORD = 4;
const THREE_BYTES = 3;
const BYTE_BITS = 8;
const BYTE_BITS_DOUBLE = 16;
const SVG_HEAD_BYTES = 4096;
const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * KIBIBYTE;
const PNG_SIGNATURE = "89504e47";
const GIF_SIGNATURE = "474946";
const BMP_SIGNATURE = "424d";
const JPEG_SIGNATURE = "ffd8";
const JPEG_MARKER_PREFIX = "ff";
const JPEG_FRAME_MARKERS = new Set(["c0", "c1", "c2", "c3", "c5", "c6", "c7", "c9", "ca", "cb", "cd", "ce", "cf"]);
const HEX = 16;
const SVG_SIZE = /\b(width|height)\s*=\s*["']\s*([0-9.]+)\s*(?:px)?\s*["']/giu;
const SVG_VIEW_BOX = /viewBox\s*=\s*["']\s*[-0-9.]+[ ,]+[-0-9.]+[ ,]+([0-9.]+)[ ,]+([0-9.]+)\s*["']/iu;
const WEBP_EXTENDED = /^RIFF[\s\S]{4}WEBPVP8X/u;

export interface IconFrame {
  width: number;
  height: number;
  bitCount: number;
  size: number;
  offset: number;
}

export interface ImageSize {
  width: number;
  height: number;
  frames: IconFrame[];
}

const NO_SIZE = {
  width: 0,
  height: 0,
  frames: []
} satisfies ImageSize;

function view(bytes: Uint8Array) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function hexAt({ bytes, position, length }: {
  bytes: Uint8Array;
  position: number;
  length: number;
}) {
  return [...bytes.subarray(position, position + length)].map(byte => byte.toString(HEX).padStart(WORD, "0")).join("");
}

function startsWith({ bytes, signature }: {
  bytes: Uint8Array;
  signature: string;
}) {
  return hexAt({
    bytes,
    position: 0,
    length: signature.length / WORD
  }) === signature;
}

/**
 * The frames an .ico file lists, in file order.
 */
export function iconFrames(bytes: Uint8Array) {
  const data = view(bytes);
  const isLongEnough = bytes.length >= OFFSET.icoEntries;
  const isIcon = isLongEnough && data.getUint16(0, true) === 0 && data.getUint16(OFFSET.icoType, true) === 1;
  if (!isIcon) {
    return [];
  }

  const count = data.getUint16(OFFSET.icoCount, true);
  const frames: IconFrame[] = [];
  for (let i = 0; i < count; i += 1) {
    const isListed = OFFSET.icoEntries + (i + 1) * OFFSET.icoEntrySize <= bytes.length;
    if (!isListed) {
      break;
    }

    const position = OFFSET.icoEntries + i * OFFSET.icoEntrySize;
    frames.push({
      width: data.getUint8(position) || ICO_LARGE,
      height: data.getUint8(position + 1) || ICO_LARGE,
      bitCount: data.getUint16(position + OFFSET.icoColorDepth, true),
      size: data.getUint32(position + OFFSET.icoDataSize, true),
      offset: data.getUint32(position + OFFSET.icoDataOffset, true)
    });
  }

  return frames;
}

/**
 * The index of the frame to show: the largest, and of those the deepest in color.
 */
export function bestFrameIndex(frames: IconFrame[]) {
  let best = 0;
  for (const [i, frame] of frames.entries()) {
    const current = frames[best];
    const area = frame.width * frame.height;
    const currentArea = (current?.width ?? 0) * (current?.height ?? 0);
    const isDeeper = area === currentArea && frame.bitCount > (current?.bitCount ?? 0);
    const isBetter = area > currentArea || isDeeper;
    best = isBetter ? i : best;
  }

  return best;
}

/**
 * An .ico file holding only the frame at the index, which a browser then draws whole.
 */
export function singleFrameIcon({ bytes, index }: {
  bytes: Uint8Array;
  index: number;
}) {
  const frame = iconFrames(bytes)[index];
  const hasNoFrame = frame === undefined;
  if (hasNoFrame) {
    return bytes;
  }

  const data = bytes.subarray(frame.offset, frame.offset + frame.size);
  const entryAt = OFFSET.icoEntries + index * OFFSET.icoEntrySize;
  const headSize = OFFSET.icoEntries + OFFSET.icoEntrySize;
  const output = new Uint8Array(headSize + data.length);
  output.set(bytes.subarray(0, OFFSET.icoEntries));
  output.set(bytes.subarray(entryAt, entryAt + OFFSET.icoEntrySize), OFFSET.icoEntries);
  output.set(data, headSize);
  const written = view(output);
  written.setUint16(OFFSET.icoCount, 1, true);
  written.setUint32(OFFSET.icoEntries + OFFSET.icoDataOffset, headSize, true);
  return output;
}

function pngSize(bytes: Uint8Array) {
  const isPng = bytes.length >= OFFSET.pngWidth + BYTE_BITS && startsWith({
    bytes,
    signature: PNG_SIGNATURE
  });
  const data = view(bytes);
  return isPng ? {
    ...NO_SIZE,
    width: data.getUint32(OFFSET.pngWidth),
    height: data.getUint32(OFFSET.pngWidth + DOUBLE_WORD)
  } : NO_SIZE;
}

function gifSize(bytes: Uint8Array) {
  const isGif = bytes.length >= OFFSET.gifWidth + DOUBLE_WORD && startsWith({
    bytes,
    signature: GIF_SIGNATURE
  });
  const data = view(bytes);
  return isGif ? {
    ...NO_SIZE,
    width: data.getUint16(OFFSET.gifWidth, true),
    height: data.getUint16(OFFSET.gifWidth + WORD, true)
  } : NO_SIZE;
}

function bmpSize(bytes: Uint8Array) {
  const isBmp = bytes.length >= OFFSET.bmpWidth + BYTE_BITS && startsWith({
    bytes,
    signature: BMP_SIGNATURE
  });
  const data = view(bytes);
  return isBmp ? {
    ...NO_SIZE,
    width: Math.abs(data.getInt32(OFFSET.bmpWidth, true)),
    height: Math.abs(data.getInt32(OFFSET.bmpWidth + DOUBLE_WORD, true))
  } : NO_SIZE;
}

function jpegSize(bytes: Uint8Array) {
  const data = view(bytes);
  const isJpeg = startsWith({
    bytes,
    signature: JPEG_SIGNATURE
  });
  let position = OFFSET.jpegSkipHeader;
  while (isJpeg && position + OFFSET.jpegMinimumTail < bytes.length) {
    const marker = hexAt({
      bytes,
      position,
      length: WORD
    });
    const isFrame = marker.startsWith(JPEG_MARKER_PREFIX) && JPEG_FRAME_MARKERS.has(marker.slice(WORD));
    if (isFrame) {
      return {
        ...NO_SIZE,
        width: data.getUint16(position + OFFSET.jpegWidth),
        height: data.getUint16(position + OFFSET.jpegHeight)
      };
    }

    position += WORD + data.getUint16(position + OFFSET.jpegLength);
  }

  return NO_SIZE;
}

function littleEndian24({ data, position }: {
  data: DataView;
  position: number;
}) {
  const low = data.getUint8(position);
  const middle = data.getUint8(position + 1) << BYTE_BITS;
  const high = data.getUint8(position + WORD) << BYTE_BITS_DOUBLE;
  return low | middle | high;
}

function webpSize(bytes: Uint8Array) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, OFFSET.webpSize));
  const isExtended = WEBP_EXTENDED.test(head) && bytes.length >= OFFSET.webpSize + THREE_BYTES * WORD;
  const data = view(bytes);
  return isExtended ? {
    ...NO_SIZE,
    width: littleEndian24({
      data,
      position: OFFSET.webpSize
    }) + 1,
    height: littleEndian24({
      data,
      position: OFFSET.webpSize + THREE_BYTES
    }) + 1
  } : NO_SIZE;
}

function svgSize(bytes: Uint8Array) {
  const text = new TextDecoder().decode(bytes.subarray(0, SVG_HEAD_BYTES));
  const sizes = new Map([...text.matchAll(SVG_SIZE)].map(match => [match[1]?.toLowerCase() ?? "", Number(match[2])]));
  const box = SVG_VIEW_BOX.exec(text);
  return {
    ...NO_SIZE,
    width: sizes.get("width") ?? Number(box?.[1] ?? 0),
    height: sizes.get("height") ?? Number(box?.[2] ?? 0)
  };
}

function iconSize(bytes: Uint8Array) {
  const frames = iconFrames(bytes);
  const best = frames[bestFrameIndex(frames)];
  return {
    width: best?.width ?? 0,
    height: best?.height ?? 0,
    frames
  } satisfies ImageSize;
}

const readers = new Map<string, (bytes: Uint8Array) => ImageSize>([
  ["ico", iconSize],
  ["png", pngSize],
  ["gif", gifSize],
  ["bmp", bmpSize],
  ["jpg", jpegSize],
  ["jpeg", jpegSize],
  ["webp", webpSize],
  ["svg", svgSize]
]);

/**
 * The pixel size of a picture of the extension (the largest frame of an .ico), zero when the bytes are not that
 * kind of file.
 */
export function imageSizeOf({ extension, bytes }: {
  extension: string;
  bytes: Uint8Array;
}) {
  return readers.get(extension)?.(bytes) ?? NO_SIZE;
}

/**
 * `4.2 KB`, `1.5 MB`: the size of a file for a hover.
 */
export function byteSizeText(size: number) {
  const isLarge = size >= MEBIBYTE;
  const isSmall = size < KIBIBYTE;
  if (isSmall) {
    return `${size} B`;
  }

  return isLarge ? `${(size / MEBIBYTE).toFixed(1)} MB` : `${(size / KIBIBYTE).toFixed(1)} KB`;
}

/**
 * The line a hover shows under a picture: its name, pixel size, file size and, for an .ico, the sizes of its frames.
 */
export function pictureCaption({ name, size, byteSize }: {
  name: string;
  size: ImageSize;
  byteSize: number;
}) {
  const dimensions = size.width > 0 ? `${size.width} x ${size.height} px` : "size unknown";
  const frames = size.frames.length > 1 ? `, frames ${size.frames.map(frame => frame.width).join(", ")}` : "";
  return `${name}: ${dimensions}, ${byteSizeText(byteSize)}${frames}`;
}
