/** A black-and-white image: one byte per pixel, 1 for black. */
export class BitMatrix {
  readonly width: number;
  readonly height: number;
  readonly bits: Uint8Array;

  constructor({ width, height }: {
    readonly width: number;
    readonly height: number;
  }) {
    this.width = width;
    this.height = height;
    this.bits = new Uint8Array(width * height);
  }

  isBlackAt({ x, y }: {
    readonly x: number;
    readonly y: number;
  }) {
    const isInside = x >= 0 && y >= 0 && x < this.width && y < this.height;
    return isInside && this.bits[y * this.width + x] === 1;
  }

  setBlack({ x, y }: {
    readonly x: number;
    readonly y: number;
  }) {
    this.bits[y * this.width + x] = 1;
  }

  transposed() {
    const result = new BitMatrix({
      width: this.height,
      height: this.width
    });
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        result.bits[x * this.height + y] = this.bits[y * this.width + x] ?? 0;
      }
    }
    return result;
  }

  inverted() {
    const result = new BitMatrix({
      width: this.width,
      height: this.height
    });
    for (let i = 0; i < this.bits.length; i++) {
      result.bits[i] = this.bits[i] === 1 ? 0 : 1;
    }
    return result;
  }
}
