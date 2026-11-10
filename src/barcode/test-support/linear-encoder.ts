import { CODE_128_PATTERNS, CODE_128_STOP_PATTERN } from "#src/barcode/linear/code-128.js";

// Encoders for the linear symbologies, to make the decoder's test symbols.
// EAN and UPC are written from GS1's bit patterns (7 modules a digit), not
// from the widths the decoder uses.

const L_BITS = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function complement(bits: string) {
  return Array.from(bits, bit => bit === "0" ? "1" : "0").join("");
}

function reverse(bits: string) {
  return Array.from(bits).reverse().join("");
}

function toBars(bits: string) {
  return Array.from(bits, bit => bit === "1");
}

/** The check digit GS1 appends to `digits` (without it). */
export function checkDigitOf(digits: string) {
  let sum = 0;
  for (const [i, digit] of Array.from(digits).reverse().entries()) {
    sum += Number(digit) * (i % 2 === 0 ? 3 : 1);
  }
  return String((10 - sum % 10) % 10);
}

/** An EAN-13 (13 digits), UPC-A (12) or EAN-8 (8) symbol for `digits`, check digit included. */
export function encodeEan(digits: string) {
  const isEan8 = digits.length === 8;
  const ean13 = digits.length === 12 ? `0${digits}` : digits;
  if (isEan8) {
    const left = Array.from(digits.slice(0, 4), digit => L_BITS[Number(digit)] ?? "");
    const right = Array.from(digits.slice(4), digit => complement(L_BITS[Number(digit)] ?? ""));
    return toBars(`101${left.join("")}01010${right.join("")}101`);
  }

  const parity = PARITY[Number(ean13.charAt(0))] ?? "";
  const left = Array.from(ean13.slice(1, 7), (digit, i) => {
    const bits = L_BITS[Number(digit)] ?? "";
    return parity.charAt(i) === "G" ? reverse(complement(bits)) : bits;
  });
  const right = Array.from(ean13.slice(7), digit => complement(L_BITS[Number(digit)] ?? ""));
  return toBars(`101${left.join("")}01010${right.join("")}101`);
}

function modulesOf(pattern: string) {
  const modules: boolean[] = [];
  for (const [i, width] of Array.from(pattern).entries()) {
    for (let count = 0; count < Number(width); count++) {
      modules.push(i % 2 === 0);
    }
  }
  return modules;
}

/** A Code 128 symbol for `values` (symbol character values, start character first); the checksum and stop are added. */
export function encodeCode128Values(values: readonly number[]) {
  let sum = values[0] ?? 0;
  for (let i = 1; i < values.length; i++) {
    sum += i * (values[i] ?? 0);
  }
  const symbols = [...values, sum % 103];
  return [
    ...symbols.flatMap(value => modulesOf(CODE_128_PATTERNS[value] ?? "")),
    ...modulesOf(CODE_128_STOP_PATTERN)
  ];
}

/** A Code 128 symbol for printable ASCII `text`: subset C for an even run of digits, otherwise subset B. */
export function encodeCode128(text: string) {
  const isDigitPairs = /^[0-9]+$/u.test(text) && text.length % 2 === 0;
  if (isDigitPairs) {
    const pairs = Array.from({ length: text.length / 2 }, (_, i) => Number(text.slice(i * 2, i * 2 + 2)));
    return encodeCode128Values([105, ...pairs]);
  }

  return encodeCode128Values([104, ...Array.from(text, character => character.charCodeAt(0) - 32)]);
}
