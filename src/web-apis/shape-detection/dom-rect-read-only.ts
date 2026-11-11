import { defineProperty } from "#src/web-apis/install.js";

/** The members of a rectangle that `DOMRectReadOnly.fromRect` reads. */
export interface DOMRectInit {
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * The web `DOMRectReadOnly`: a rectangle with its edges. A width or height may
 * be negative, as on the web, and then `left` and `top` are the smaller edges.
 */
export class DOMRectReadOnly {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;

  constructor(x = 0, y = 0, width = 0, height = 0) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
  }

  /** The rectangle a dictionary describes; absent members are 0. */
  static fromRect(other: DOMRectInit = {}) {
    return new DOMRectReadOnly(other.x, other.y, other.width, other.height);
  }

  /** The smaller of the two horizontal edges. */
  get left() {
    return Math.min(this.x, this.x + this.width);
  }

  /** The larger of the two horizontal edges. */
  get right() {
    return Math.max(this.x, this.x + this.width);
  }

  /** The smaller of the two vertical edges. */
  get top() {
    return Math.min(this.y, this.y + this.height);
  }

  /** The larger of the two vertical edges. */
  get bottom() {
    return Math.max(this.y, this.y + this.height);
  }

  /** The members `JSON.stringify` writes. */
  toJSON() {
    return {
      x: this.x,
      y: this.y,
      width: this.width,
      height: this.height,
      top: this.top,
      right: this.right,
      bottom: this.bottom,
      left: this.left
    };
  }

  get [Symbol.toStringTag]() {
    return "DOMRectReadOnly";
  }
}

/**
 * Defines `globalThis.DOMRectReadOnly` where the realm has none.
 *
 * @returns The function that takes it away again.
 */
export function installDOMRectReadOnly() {
  const hasRectangle = "DOMRectReadOnly" in globalThis;
  if (hasRectangle) {
    return () => {};
  }

  return defineProperty({
    name: "DOMRectReadOnly",
    value: DOMRectReadOnly
  });
}
