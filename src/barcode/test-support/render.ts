import { BitMatrix } from "#src/barcode/bit-matrix.js";

// Draws a grid of modules into RGBA pixels the way a screen shows a code: a
// scale, a quiet zone, a rotation, a mirror, optionally on a busy background.

export interface Image {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8ClampedArray;
}

export interface RenderOptions {
  readonly grid: BitMatrix;
  /** Pixels per module. */
  readonly scale: number;
  /** Blank modules around the grid. */
  readonly quietModules?: number;
  /** Quarter turns clockwise. */
  readonly quarterTurns?: number;
  readonly isMirrored?: boolean;
  /** Degrees clockwise, for an arbitrary tilt (the image grows to hold the grid). */
  readonly angle?: number;
  readonly foreground?: number;
  readonly background?: number;
}

interface Position {
  readonly x: number;
  readonly y: number;
}

const WHITE = 255;
const BLACK = 0;
const FULL_TURN = 4;
const DEFAULT_QUIET_MODULES = 4;
const HALF_TURN_DEGREES = 180;

export function gridFromRows(rows: readonly string[]) {
  const grid = new BitMatrix({
    width: rows[0]?.length ?? 0,
    height: rows.length
  });
  for (const [y, row] of rows.entries()) {
    for (const [x, character] of Array.from(row).entries()) {
      const isDark = character === "#";
      if (isDark) {
        grid.setBlack({
          x,
          y
        });
      }
    }
  }
  return grid;
}

export function gridFromBars({ bars, height }: {
  readonly bars: readonly boolean[];
  readonly height: number;
}) {
  const grid = new BitMatrix({
    width: bars.length,
    height
  });
  for (let y = 0; y < height; y++) {
    for (const [x, isBar] of bars.entries()) {
      if (isBar) {
        grid.setBlack({
          x,
          y
        });
      }
    }
  }
  return grid;
}

function mapped({ grid, width, height, place }: {
  readonly grid: BitMatrix;
  readonly width: number;
  readonly height: number;
  readonly place: (position: Position) => Position;
}) {
  const result = new BitMatrix({
    width,
    height
  });
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const isDark = grid.isBlackAt({
        x,
        y
      });
      if (isDark) {
        result.setBlack(
          place({
            x,
            y
          })
        );
      }
    }
  }
  return result;
}

function turned({ grid, quarterTurns, isMirrored }: {
  readonly grid: BitMatrix;
  readonly quarterTurns: number;
  readonly isMirrored: boolean;
}) {
  let current = isMirrored
    ? mapped({
      grid,
      width: grid.width,
      height: grid.height,
      place: ({ x, y }) => ({
        x: grid.width - 1 - x,
        y
      })
    })
    : grid;
  for (let i = 0; i < ((quarterTurns % FULL_TURN) + FULL_TURN) % FULL_TURN; i++) {
    const source = current;
    current = mapped({
      grid: source,
      width: source.height,
      height: source.width,
      place: ({ x, y }) => ({
        x: source.height - 1 - y,
        y: x
      })
    });
  }
  return current;
}

export function render(options: RenderOptions) {
  const {
    scale,
    quietModules = DEFAULT_QUIET_MODULES,
    quarterTurns = 0,
    isMirrored = false,
    angle = 0,
    foreground = BLACK,
    background = WHITE
  } = options;
  const grid = turned({
    grid: options.grid,
    quarterTurns,
    isMirrored
  });
  const sideX = grid.width + quietModules * 2;
  const sideY = grid.height + quietModules * 2;
  const radians = angle * Math.PI / HALF_TURN_DEGREES;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const width = Math.ceil((sideX * Math.abs(cos) + sideY * Math.abs(sin)) * scale);
  const height = Math.ceil((sideX * Math.abs(sin) + sideY * Math.abs(cos)) * scale);
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offsetX = x + 0.5 - width / 2;
      const offsetY = y + 0.5 - height / 2;
      const isDark = grid.isBlackAt({
        x: Math.floor((offsetX * cos + offsetY * sin) / scale + sideX / 2 - quietModules),
        y: Math.floor((-offsetX * sin + offsetY * cos) / scale + sideY / 2 - quietModules)
      });
      const level = isDark ? foreground : background;
      pixels.set([level, level, level, WHITE], (y * width + x) * 4);
    }
  }
  return {
    width,
    height,
    pixels
  };
}

/** Puts `image` at `offset` inside a larger canvas filled by `fill` (a function of the pixel: noise, clutter). */
export function embed({ image, width, height, offset, fill }: {
  readonly image: Image;
  readonly width: number;
  readonly height: number;
  readonly offset: Position;
  readonly fill: (position: Position) => number;
}) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const level = fill({
        x,
        y
      });
      pixels.set([level, level, level, WHITE], (y * width + x) * 4);
    }
  }
  for (let y = 0; y < image.height; y++) {
    const row = image.pixels.subarray(y * image.width * 4, (y + 1) * image.width * 4);
    pixels.set(row, ((y + offset.y) * width + offset.x) * 4);
  }
  return {
    width,
    height,
    pixels
  };
}

function averageAround({ image, x, y, radius }: {
  readonly image: Image;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}) {
  let sum = 0;
  let count = 0;
  for (let sampleY = Math.max(0, y - radius); sampleY <= Math.min(image.height - 1, y + radius); sampleY++) {
    for (let sampleX = Math.max(0, x - radius); sampleX <= Math.min(image.width - 1, x + radius); sampleX++) {
      sum += image.pixels[(sampleY * image.width + sampleX) * 4] ?? 0;
      count++;
    }
  }
  return sum / count;
}

/** A box blur, to stand for a scaled-down or soft screenshot. */
export function blur({ image, radius }: {
  readonly image: Image;
  readonly radius: number;
}) {
  const pixels = new Uint8ClampedArray(image.pixels.length);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const level = averageAround({
        image,
        x,
        y,
        radius
      });
      pixels.set([level, level, level, WHITE], (y * image.width + x) * 4);
    }
  }
  return {
    width: image.width,
    height: image.height,
    pixels
  };
}
