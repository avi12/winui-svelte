// ISO/IEC 18004 section 7.4: the segments a symbol's data codewords hold.

const MODE_TERMINATOR = 0;
const MODE_NUMERIC = 1;
const MODE_ALPHANUMERIC = 2;
const MODE_STRUCTURED_APPEND = 3;
const MODE_BYTE = 4;
const MODE_FNC1_FIRST = 5;
const MODE_ECI = 7;
const MODE_KANJI = 8;
const MODE_FNC1_SECOND = 9;
const MODE_BITS = 4;

const ALPHANUMERIC_CHARACTERS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";
const ALPHANUMERIC_BASE = 45;
const ALPHANUMERIC_PAIR_BITS = 11;
const ALPHANUMERIC_SINGLE_BITS = 6;
const NUMERIC_GROUP = 3;
const DECIMAL_BASE = 10;
const NUMERIC_TRIPLE_BITS = 10;
const NUMERIC_PAIR_BITS = 7;
const NUMERIC_SINGLE_BITS = 4;
const BYTE_BITS = 8;
const BYTE_MASK = 0xff;
const KANJI_BITS = 13;
const KANJI_ROW_SIZE = 0xc0;
const KANJI_LOW_OFFSET = 0x8140;
const KANJI_HIGH_OFFSET = 0xc140;
const KANJI_LOW_LIMIT = 0x9ffc;
const STRUCTURED_APPEND_BITS = 16;
const FNC1_APPLICATION_BITS = 8;
const ECI_SHORT_BITS = 7;
const ECI_MEDIUM_BITS = 14;
const ECI_LONG_BITS = 21;
const SMALL_VERSION_LIMIT = 9;
const MEDIUM_VERSION_LIMIT = 26;

const NUMERIC_BITS_OF_DIGITS: Readonly<Record<number, number>> = {
  1: NUMERIC_SINGLE_BITS,
  2: NUMERIC_PAIR_BITS,
  [NUMERIC_GROUP]: NUMERIC_TRIPLE_BITS
};

// The bits after the mode of the segments that carry no text.
const CONTROL_BITS: Readonly<Record<number, number | undefined>> = {
  [MODE_STRUCTURED_APPEND]: STRUCTURED_APPEND_BITS,
  [MODE_FNC1_FIRST]: 0,
  [MODE_FNC1_SECOND]: FNC1_APPLICATION_BITS
};

// The bits of a segment's character count, for versions 1 to 9, 10 to 26 and 27 to 40.
const COUNT_BITS: Readonly<Record<number, string | undefined>> = {
  [MODE_NUMERIC]: "10 12 14",
  [MODE_ALPHANUMERIC]: "9 11 13",
  [MODE_BYTE]: "8 16 16",
  [MODE_KANJI]: "8 10 12"
};

// The character sets ECI designators name that a TextDecoder reads.
const ECI_ENCODINGS: Readonly<Record<string, string | undefined>> = {
  20: "shift_jis",
  22: "windows-1251",
  23: "windows-1252",
  24: "windows-1256",
  25: "utf-16be",
  26: "utf-8",
  27: "us-ascii",
  28: "big5",
  29: "gb18030",
  30: "euc-kr"
};
const ECI_LATIN_1 = 3;
const DEFAULT_ENCODING = "utf-8";

class BitReader {
  private position = 0;
  private readonly data: Uint8Array;

  constructor(data: Uint8Array) {
    this.data = data;
  }

  get remaining() {
    return this.data.length * BYTE_BITS - this.position;
  }

  read(count: number) {
    let value = 0;
    for (let i = 0; i < count; i++) {
      const byte = this.data[Math.floor(this.position / BYTE_BITS)] ?? 0;
      const shift = BYTE_BITS - 1 - this.position % BYTE_BITS;
      value = value * 2 + ((byte >> shift) & 1);
      this.position++;
    }
    return value;
  }
}

function countBitsOf({ mode, version }: {
  readonly mode: number;
  readonly version: number;
}) {
  const index = Number(version > SMALL_VERSION_LIMIT) + Number(version > MEDIUM_VERSION_LIMIT);
  return Number((COUNT_BITS[mode] ?? "").split(" ")[index]);
}

function readNumeric({ reader, count }: {
  readonly reader: BitReader;
  readonly count: number;
}) {
  let text = "";
  let left = count;
  while (left > 0) {
    const digits = Math.min(left, NUMERIC_GROUP);
    const value = reader.read(NUMERIC_BITS_OF_DIGITS[digits] ?? NUMERIC_SINGLE_BITS);
    const isTooLarge = value >= DECIMAL_BASE ** digits;
    if (isTooLarge) {
      return undefined;
    }

    text += String(value).padStart(digits, "0");
    left -= digits;
  }
  return text;
}

function readAlphanumeric({ reader, count }: {
  readonly reader: BitReader;
  readonly count: number;
}) {
  let text = "";
  let left = count;
  while (left > 0) {
    const isPair = left >= 2;
    const value = reader.read(isPair ? ALPHANUMERIC_PAIR_BITS : ALPHANUMERIC_SINGLE_BITS);
    const limit = isPair ? ALPHANUMERIC_BASE * ALPHANUMERIC_BASE : ALPHANUMERIC_BASE;
    const isOutOfRange = value >= limit;
    if (isOutOfRange) {
      return undefined;
    }

    const high = ALPHANUMERIC_CHARACTERS.charAt(Math.floor(value / ALPHANUMERIC_BASE));
    const low = ALPHANUMERIC_CHARACTERS.charAt(value % ALPHANUMERIC_BASE);
    text += isPair ? high + low : low;
    left -= isPair ? 2 : 1;
  }
  return text;
}

function isValidUtf8(bytes: Uint8Array) {
  try {
    new TextDecoder(DEFAULT_ENCODING, { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function latin1Of(bytes: Uint8Array) {
  return Array.from(bytes, byte => String.fromCharCode(byte)).join("");
}

function decodeBytes({ bytes, eci }: {
  readonly bytes: Uint8Array;
  readonly eci: number | undefined;
}) {
  const isAutomatic = eci === undefined;
  if (isAutomatic) {
    // The standard says ISO 8859-1 without an ECI, but senders write UTF-8: valid UTF-8 is read as that.
    return isValidUtf8(bytes) ? new TextDecoder().decode(bytes) : latin1Of(bytes);
  }

  const isLatin1 = eci === ECI_LATIN_1;
  const label = ECI_ENCODINGS[eci] ?? DEFAULT_ENCODING;
  return isLatin1 ? latin1Of(bytes) : new TextDecoder(label).decode(bytes);
}

function readBytes({ reader, count }: {
  readonly reader: BitReader;
  readonly count: number;
}) {
  const bytes = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    bytes[i] = reader.read(BYTE_BITS);
  }
  return bytes;
}

function readKanji({ reader, count }: {
  readonly reader: BitReader;
  readonly count: number;
}) {
  const bytes = new Uint8Array(count * 2);
  for (let i = 0; i < count; i++) {
    const value = reader.read(KANJI_BITS);
    const row = Math.floor(value / KANJI_ROW_SIZE);
    const sum = row * KANJI_ROW_SIZE + (value % KANJI_ROW_SIZE);
    const isLowRange = sum + KANJI_LOW_OFFSET <= KANJI_LOW_LIMIT;
    const shiftJis = sum + (isLowRange ? KANJI_LOW_OFFSET : KANJI_HIGH_OFFSET);
    bytes[i * 2] = shiftJis >> BYTE_BITS;
    bytes[i * 2 + 1] = shiftJis & BYTE_MASK;
  }
  return new TextDecoder("shift_jis").decode(bytes);
}

function readEciDesignator(reader: BitReader) {
  const isShort = reader.read(1) === 0;
  if (isShort) {
    return reader.read(ECI_SHORT_BITS);
  }

  const isMedium = reader.read(1) === 0;
  if (isMedium) {
    return reader.read(ECI_MEDIUM_BITS);
  }

  reader.read(1);
  return reader.read(ECI_LONG_BITS);
}

function readSegment({ mode, reader, version, eci }: {
  readonly mode: number;
  readonly reader: BitReader;
  readonly version: number;
  readonly eci: number | undefined;
}) {
  const count = reader.read(
    countBitsOf({
      mode,
      version
    })
  );
  const isNumeric = mode === MODE_NUMERIC;
  if (isNumeric) {
    return readNumeric({
      reader,
      count
    });
  }

  const isAlphanumeric = mode === MODE_ALPHANUMERIC;
  if (isAlphanumeric) {
    return readAlphanumeric({
      reader,
      count
    });
  }

  const isKanji = mode === MODE_KANJI;
  if (isKanji) {
    return readKanji({
      reader,
      count
    });
  }

  return decodeBytes({
    bytes: readBytes({
      reader,
      count
    }),
    eci
  });
}

/** Reads the text from a symbol's data codewords, or `undefined` when the segments are malformed. */
export function parseBitstream({ data, version }: {
  readonly data: Uint8Array;
  readonly version: number;
}) {
  const reader = new BitReader(data);
  let text = "";
  let eci: number | undefined;
  while (reader.remaining >= MODE_BITS) {
    const mode = reader.read(MODE_BITS);
    const controlBits = CONTROL_BITS[mode];
    const isTextMode = COUNT_BITS[mode] !== undefined;
    const isTerminator = mode === MODE_TERMINATOR;
    if (isTerminator) {
      break;
    }

    const isEci = mode === MODE_ECI;
    if (isEci) {
      eci = readEciDesignator(reader);
    } else if (controlBits !== undefined) {
      reader.read(controlBits);
    } else if (isTextMode) {
      const segment = readSegment({
        mode,
        reader,
        version,
        eci
      });
      const isMalformed = segment === undefined;
      if (isMalformed) {
        return undefined;
      }

      text += segment;
    } else {
      return undefined;
    }
  }
  return text;
}
