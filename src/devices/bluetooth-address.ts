const ADDRESS_BYTES = 6;
const BYTE_BITS = 8n;
const BYTE_MASK = 0xFFn;
const HEX_RADIX = 16;
const HEX_DIGITS_PER_BYTE = 2;
const ADDRESS_PATTERN = /^[0-9a-f]{2}(:[0-9a-f]{2}){5}$/iu;

/**
 * A Bluetooth address (a 48-bit number, WinRT's `BluetoothAddress`) as the
 * text people read: `AA:BB:CC:DD:EE:FF`.
 *
 * @param address - The address WinRT gives.
 * @returns Six uppercase hex bytes joined by colons.
 */
export function addressText(address: bigint) {
  const bytes: string[] = [];
  for (let iByte = ADDRESS_BYTES - 1; iByte >= 0; iByte--) {
    const byte = Number(address >> BigInt(iByte) * BYTE_BITS & BYTE_MASK);
    bytes.push(byte.toString(HEX_RADIX).padStart(HEX_DIGITS_PER_BYTE, "0").toUpperCase());
  }

  return bytes.join(":");
}

/**
 * The address of the text `AA:BB:CC:DD:EE:FF`, for the calls that take one
 * (`BluetoothLEDevice.fromBluetoothAddressAsync`).
 *
 * @param text - Six hex bytes joined by colons.
 * @returns The 48-bit address.
 * @throws {TypeError} When the text is not an address.
 */
export function addressOfText(text: string) {
  if (!ADDRESS_PATTERN.test(text)) {
    throw new TypeError(`${text} is not a Bluetooth address (AA:BB:CC:DD:EE:FF)`);
  }

  return BigInt(`0x${text.replaceAll(":", "")}`);
}
