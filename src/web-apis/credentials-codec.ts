import { createHash } from "node:crypto";

const MAJOR_UNSIGNED = 0;
const MAJOR_NEGATIVE = 1;
const MAJOR_BYTES = 2;
const MAJOR_TEXT = 3;
const MAJOR_MAP = 4;
const MAJOR_SHIFT = 5;
const INLINE_LIMIT = 24;
const ONE_BYTE_LIMIT = 0x100;
const TWO_BYTE_LIMIT = 0x10000;
const ONE_BYTE_FOLLOWS = 24;
const TWO_BYTES_FOLLOW = 25;
const FOUR_BYTES_FOLLOW = 26;
const BYTE_MASK = 0xff;
const BYTE_BITS = 8;
const DER_SEQUENCE = 0x30;
const DER_INTEGER = 0x02;
const DER_BIT_STRING = 0x03;
const DER_LONG_FORM = 0x80;
const DER_LENGTH_MASK = 0x7f;
const BIT_STRING_PREFIX_BYTES = 1;

/** A value the CBOR encoder writes: integers, text, bytes and ordered maps. */
export type CborValue = number | string | Uint8Array | ReadonlyMap<CborValue, CborValue>;

interface DerElement {
  readonly tag: number;
  readonly content: Uint8Array;
}

/**
 * Concatenates byte arrays.
 *
 * @param parts - The arrays, in order.
 * @returns One array holding all of them.
 */
export function concatenate(parts: readonly Uint8Array[]) {
  return new Uint8Array(Buffer.concat(parts));
}

/**
 * Writes bytes as unpadded base64url, the web's form of a credential id.
 *
 * @param bytes - The bytes.
 * @returns The text.
 */
export function base64urlOf(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Reads unpadded base64url text.
 *
 * @param text - The text.
 * @returns The bytes.
 */
export function bytesOfBase64url(text: string) {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

/**
 * The SHA-256 digest of some bytes.
 *
 * @param bytes - The input.
 * @returns The 32 byte digest.
 */
export function sha256Of(bytes: Uint8Array) {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

/**
 * A copy of the bytes in a standalone `ArrayBuffer`, as the web hands them out.
 *
 * @param bytes - The bytes.
 * @returns The buffer.
 */
export function arrayBufferOf(bytes: Uint8Array) {
  return Uint8Array.from(bytes).buffer;
}

/**
 * The bytes a `BufferSource` holds, copied.
 *
 * @param source - An `ArrayBuffer` or a view of one.
 * @returns The bytes.
 */
export function bytesOfSource(source: BufferSource) {
  const isView = ArrayBuffer.isView(source);
  if (isView) {
    return Uint8Array.from(new Uint8Array(source.buffer, source.byteOffset, source.byteLength));
  }

  return Uint8Array.from(new Uint8Array(source));
}

function head({ major, length }: {
  major: number;
  length: number;
}) {
  const base = major << MAJOR_SHIFT;
  const isInline = length < INLINE_LIMIT;
  if (isInline) {
    return Uint8Array.of(base | length);
  }

  const isOneByte = length < ONE_BYTE_LIMIT;
  if (isOneByte) {
    return Uint8Array.of(base | ONE_BYTE_FOLLOWS, length);
  }

  const isTwoBytes = length < TWO_BYTE_LIMIT;
  if (isTwoBytes) {
    return Uint8Array.of(base | TWO_BYTES_FOLLOW, length >> BYTE_BITS, length & BYTE_MASK);
  }

  const wide = Buffer.alloc(Uint32Array.BYTES_PER_ELEMENT);
  wide.writeUInt32BE(length);
  return concatenate([Uint8Array.of(base | FOUR_BYTES_FOLLOW), wide]);
}

/**
 * Encodes a value as CBOR, with map entries in the order given.
 *
 * @param value - The value.
 * @returns The encoding.
 */
// eslint-disable-next-line no-restricted-syntax -- a recursive function needs its return type written
export function encodeCbor(value: CborValue): Uint8Array {
  const isNumber = typeof value === "number";
  if (isNumber) {
    const isNegative = value < 0;
    return isNegative ? head({
      major: MAJOR_NEGATIVE,
      length: -1 - value
    }) : head({
      major: MAJOR_UNSIGNED,
      length: value
    });
  }

  const isText = typeof value === "string";
  if (isText) {
    const text = Buffer.from(value, "utf8");
    return concatenate([head({
      major: MAJOR_TEXT,
      length: text.length
    }), text]);
  }

  const isBytes = value instanceof Uint8Array;
  if (isBytes) {
    return concatenate([head({
      major: MAJOR_BYTES,
      length: value.length
    }), value]);
  }

  const entries = [...value].flatMap(([key, entry]) => [encodeCbor(key), encodeCbor(entry)]);
  return concatenate([head({
    major: MAJOR_MAP,
    length: value.size
  }), ...entries]);
}

function readElement({ bytes, offset }: {
  bytes: Uint8Array;
  offset: number;
}) {
  const tag = bytes[offset];
  const first = bytes[offset + 1];
  const isMalformed = tag === undefined || first === undefined;
  if (isMalformed) {
    throw new Error("malformed DER");
  }

  const isLongForm = (first & DER_LONG_FORM) !== 0;
  const lengthBytes = isLongForm ? first & DER_LENGTH_MASK : 0;
  let length = isLongForm ? 0 : first;
  for (let i = 0; i < lengthBytes; i += 1) {
    length = length * (BYTE_MASK + 1) + (bytes[offset + 2 + i] ?? 0);
  }

  const start = offset + 2 + lengthBytes;
  const end = start + length;
  const isTruncated = end > bytes.length;
  if (isTruncated) {
    throw new Error("malformed DER");
  }

  return {
    element: {
      tag,
      content: bytes.subarray(start, end)
    } satisfies DerElement,
    end
  };
}

function childrenOf(sequence: DerElement) {
  const children: DerElement[] = [];
  let offset = 0;
  while (offset < sequence.content.length) {
    const read = readElement({
      bytes: sequence.content,
      offset
    });
    children.push(read.element);
    offset = read.end;
  }

  return children;
}

function expectTag({ element, tag }: {
  element: DerElement | undefined;
  tag: number;
}) {
  const isExpected = element !== undefined && element.tag === tag;
  if (!isExpected) {
    throw new Error("unexpected DER structure");
  }

  return element;
}

function unsignedInteger(element: DerElement | undefined) {
  const integer = expectTag({
    element,
    tag: DER_INTEGER
  });
  const iFirst = integer.content.findIndex(byte => byte !== 0);
  return integer.content.slice(Math.max(iFirst, 0));
}

/**
 * Reads the modulus and exponent out of a DER `SubjectPublicKeyInfo` holding an RSA key.
 *
 * @param spki - The key as Windows and the web export it.
 * @returns The key's parts.
 * @throws {Error} When the bytes are not an RSA public key.
 */
export function parseRsaPublicKey(spki: Uint8Array) {
  const outer = expectTag({
    element: readElement({
      bytes: spki,
      offset: 0
    }).element,
    tag: DER_SEQUENCE
  });
  const [, bitString] = childrenOf(outer);
  const key = expectTag({
    element: bitString,
    tag: DER_BIT_STRING
  });
  const inner = expectTag({
    element: readElement({
      bytes: key.content.subarray(BIT_STRING_PREFIX_BYTES),
      offset: 0
    }).element,
    tag: DER_SEQUENCE
  });
  const [modulus, exponent] = childrenOf(inner);
  return {
    modulus: unsignedInteger(modulus),
    exponent: unsignedInteger(exponent)
  };
}
