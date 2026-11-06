import { BadgeGlyph } from "#src/web-apis/badge-glyph.js";
import { BYTES_PER_PIXEL, pixelBytes } from "#src/win32-icons.js";

// Draws the badge of `navigator.setAppBadge` as pixels, for the taskbar
// overlay icon Windows is not asked to draw (the toast badge is drawn by
// Windows itself, and only for an app with package identity). The glyph set is
// the toast badge's own (`BadgeGlyph`), so both read from one list.

const MAX_LABEL_COUNT = 99;
const OVERFLOW_LABEL = "99+";
const GLYPH_SCALE_HEIGHT = 0.7;
const GLYPH_SCALE_WIDTH = 0.75;
const EDGE_SOFTNESS = 1;
const MARK_ROWS = 5;
const DIGIT_COLUMNS = 3;
const MARK_COLUMNS = 5;
const DIGIT_GAP = 1;
const CENTER = 0.5;
const OPAQUE = 255;
const ALPHA_OFFSET = 3;

// Colors as hex text, read into bytes when a badge is drawn.
type Rgb = string;

const WHITE: Rgb = "ffffff";
const RED: Rgb = "c42b1c";
const GREEN: Rgb = "0f7b0f";
const AMBER: Rgb = "9d5d00";
const BLUE: Rgb = "0067c0";
const GREY: Rgb = "606060";

/** The shapes drawn in white on a glyph's disc. */
const Mark = {
  DOT: "dot",
  BANG: "bang",
  CHECK: "check",
  CROSS: "cross",
  PLAY: "play",
  PAUSE: "pause"
} as const;
type Mark = (typeof Mark)[keyof typeof Mark];

const MARKS: Record<Mark, readonly string[]> = {
  [Mark.DOT]: ["00000", "01110", "01110", "01110", "00000"],
  [Mark.BANG]: ["00100", "00100", "00100", "00000", "00100"],
  [Mark.CHECK]: ["00000", "00001", "10010", "01100", "00000"],
  [Mark.CROSS]: ["10001", "01010", "00100", "01010", "10001"],
  [Mark.PLAY]: ["01000", "01100", "01110", "01100", "01000"],
  [Mark.PAUSE]: ["01010", "01010", "01010", "01010", "01010"]
};

// Three columns by five rows, one string per row, "1" lit.
const DIGITS: Record<string, readonly string[]> = {
  0: ["111", "101", "101", "101", "111"],
  1: ["010", "110", "010", "010", "111"],
  2: ["111", "001", "111", "100", "111"],
  3: ["111", "001", "111", "001", "111"],
  4: ["101", "101", "111", "001", "001"],
  5: ["111", "100", "111", "001", "111"],
  6: ["111", "100", "111", "101", "111"],
  7: ["111", "001", "010", "010", "010"],
  8: ["111", "101", "111", "101", "111"],
  9: ["111", "101", "111", "001", "111"],
  "+": ["000", "010", "111", "010", "000"]
};

const GLYPH_LOOKS: Record<Exclude<BadgeGlyph, typeof BadgeGlyph.NONE>, {
  readonly color: Rgb;
  readonly mark: Mark;
}> = {
  [BadgeGlyph.ACTIVITY]: {
    color: BLUE,
    mark: Mark.DOT
  },
  [BadgeGlyph.ALARM]: {
    color: AMBER,
    mark: Mark.BANG
  },
  [BadgeGlyph.ALERT]: {
    color: RED,
    mark: Mark.BANG
  },
  [BadgeGlyph.ATTENTION]: {
    color: RED,
    mark: Mark.BANG
  },
  [BadgeGlyph.AVAILABLE]: {
    color: GREEN,
    mark: Mark.CHECK
  },
  [BadgeGlyph.AWAY]: {
    color: AMBER,
    mark: Mark.DOT
  },
  [BadgeGlyph.BUSY]: {
    color: RED,
    mark: Mark.DOT
  },
  [BadgeGlyph.ERROR]: {
    color: RED,
    mark: Mark.CROSS
  },
  [BadgeGlyph.NEW_MESSAGE]: {
    color: BLUE,
    mark: Mark.BANG
  },
  [BadgeGlyph.PAUSED]: {
    color: GREY,
    mark: Mark.PAUSE
  },
  [BadgeGlyph.PLAYING]: {
    color: GREEN,
    mark: Mark.PLAY
  },
  [BadgeGlyph.UNAVAILABLE]: {
    color: GREY,
    mark: Mark.CROSS
  }
};

/** What a badge shows: a count (red disc) or a status glyph. */
export type BadgeFace = {
  readonly count: number;
} | {
  readonly glyph: Exclude<BadgeGlyph, typeof BadgeGlyph.NONE>;
};

/**
 * The text a count badge shows: the number, or "99+" above 99.
 *
 * @param count - A positive integer.
 * @returns The label.
 */
export function badgeLabel(count: number) {
  return count > MAX_LABEL_COUNT ? OVERFLOW_LABEL : String(count);
}

/**
 * What the screen reader says for the badge, which is also the overlay icon's
 * accessibility description.
 *
 * @param face - The count or the glyph.
 * @returns The description.
 */
export function badgeDescription(face: BadgeFace) {
  return "count" in face ? `${badgeLabel(face.count)} unread` : face.glyph;
}

function bitmapOf({ face }: {
  face: BadgeFace;
}) {
  const isCount = "count" in face;
  if (isCount) {
    const rows = Array.from({ length: MARK_ROWS }, () => "");
    const characters = badgeLabel(face.count).split("");
    for (const [iCharacter, character] of characters.entries()) {
      const glyphRows = DIGITS[character] ?? [];
      const gap = iCharacter === 0 ? "" : "0".repeat(DIGIT_GAP);
      for (const [iRow, row] of glyphRows.entries()) {
        rows[iRow] = `${rows[iRow] ?? ""}${gap}${row}`;
      }
    }

    return {
      rows,
      color: RED
    };
  }

  const look = GLYPH_LOOKS[face.glyph];
  return {
    rows: MARKS[look.mark],
    color: look.color
  };
}

function isLit({ rows, column, row }: {
  rows: readonly string[];
  column: number;
  row: number;
}) {
  return rows[row]?.[column] === "1";
}

/**
 * Draws a badge as a square icon: a disc with the count or the glyph's mark in
 * white, anti-aliased on the rim, clear outside the disc.
 *
 * @param options - The pixels per side and what to show.
 * @returns The pixels, blue first, with straight alpha.
 */
export function renderBadgeIcon({ size, face }: {
  size: number;
  face: BadgeFace;
}) {
  const { rows, color } = bitmapOf({ face });
  const columns = rows[0]?.length ?? DIGIT_COLUMNS;
  const isGlyph = !("count" in face);
  const fitColumns = isGlyph ? MARK_COLUMNS : columns;
  const byHeight = Math.floor((size * GLYPH_SCALE_HEIGHT) / MARK_ROWS);
  const byWidth = Math.floor((size * GLYPH_SCALE_WIDTH) / fitColumns);
  const scale = Math.max(1, Math.min(byHeight, byWidth));
  const left = Math.floor((size - columns * scale) / 2);
  const top = Math.floor((size - MARK_ROWS * scale) / 2);
  const radius = size / 2;
  const bgra = new Uint8Array(pixelBytes(size));
  const disc = Buffer.from(color, "hex");
  const ink = Buffer.from(WHITE, "hex");
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + CENTER - radius, y + CENTER - radius);
      const coverage = Math.min(1, Math.max(0, (radius - distance) / EDGE_SOFTNESS));
      const column = Math.floor((x - left) / scale);
      const row = Math.floor((y - top) / scale);
      const isInk = x >= left && y >= top && isLit({
        rows,
        column,
        row
      });

      const [red = 0, green = 0, blue = 0] = isInk ? ink : disc;
      const offset = (y * size + x) * BYTES_PER_PIXEL;
      bgra[offset] = blue;
      bgra[offset + 1] = green;
      bgra[offset + 2] = red;
      bgra[offset + ALPHA_OFFSET] = Math.round(coverage * OPAQUE);
    }
  }

  return {
    size,
    bgra
  };
}
