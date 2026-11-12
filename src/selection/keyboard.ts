import type { Point } from "./geometry.ts";
import type { SelectorEvent } from "./selector.ts";
import { SelectorEventKind } from "./selector.ts";

/** How far Alt plus an arrow nudges a selection, in device-independent pixels. */
export const NUDGE_STEP = 1;

/** How far Alt, Shift and an arrow nudge a selection, in device-independent pixels. */
export const NUDGE_LARGE_STEP = 10;

const ARROWS = new Map<string, Point>([
  ["ArrowLeft", {
    x: -1,
    y: 0
  }],
  ["ArrowRight", {
    x: 1,
    y: 0
  }],
  ["ArrowUp", {
    x: 0,
    y: -1
  }],
  ["ArrowDown", {
    x: 0,
    y: 1
  }]
]);

/** A key combination as data: the modifiers held and the family of keys it is pressed with. */
export interface KeyChord {
  readonly isControl: boolean;
  readonly isAlt: boolean;
  readonly isShift: boolean;

  /** The key family, after the modifiers; `Arrow` stands for the four arrow keys. */
  readonly key: string;
}

/** One binding: what `selectorKeyEvent` does for a chord, found by its `id` for a help panel's wording. */
export interface SelectionShortcut {
  readonly id: string;
  readonly chord: KeyChord;
  readonly kind: typeof SelectorEventKind.nudge | typeof SelectorEventKind.resizeBy;

  /** How far the arrow moves the selection or its bottom right corner. */
  readonly step: number;
}

/**
 * Every default keyboard shortcut of a selection, as data: the one list the
 * key handling reads and an app builds its help from, looking its wording up
 * by `id`.
 */
export const SELECTION_SHORTCUTS = {
  nudge: {
    id: "nudge",
    chord: {
      isControl: false,
      isAlt: true,
      isShift: false,
      key: "Arrow"
    },
    kind: SelectorEventKind.nudge,
    step: NUDGE_STEP
  },
  nudgeLarge: {
    id: "nudgeLarge",
    chord: {
      isControl: false,
      isAlt: true,
      isShift: true,
      key: "Arrow"
    },
    kind: SelectorEventKind.nudge,
    step: NUDGE_LARGE_STEP
  },
  resize: {
    id: "resize",
    chord: {
      isControl: true,
      isAlt: true,
      isShift: false,
      key: "Arrow"
    },
    kind: SelectorEventKind.resizeBy,
    step: NUDGE_STEP
  },
  resizeLarge: {
    id: "resizeLarge",
    chord: {
      isControl: true,
      isAlt: true,
      isShift: true,
      key: "Arrow"
    },
    kind: SelectorEventKind.resizeBy,
    step: NUDGE_LARGE_STEP
  }
} as const;

/**
 * A chord as text for a help screen: modifiers in the order Ctrl, Alt, Shift,
 * then the key, joined with plus signs.
 *
 * @param chord - The key combination.
 * @returns For example `Alt+Shift+Arrow`.
 */
export function formatChord(chord: KeyChord) {
  const modifiers = [
    chord.isControl ? "Ctrl" : "",
    chord.isAlt ? "Alt" : "",
    chord.isShift ? "Shift" : ""
  ];
  return [...modifiers, chord.key].filter(part => part !== "").join("+");
}

/**
 * The selector event an arrow key makes, by a table of shortcuts (by default
 * `SELECTION_SHORTCUTS`: Alt nudges the selection by 1, Alt and Shift by 10,
 * Ctrl and Alt resize it from the bottom right, with Shift by 10).
 *
 * @param options - The `key` of the keyboard event, its modifier keys and, to rebind or drop shortcuts, `shortcuts`.
 * @returns The event for `reduceSelector`, or undefined for any other key.
 */
export function selectorKeyEvent({ key, isAlt, isShift, isControl, shortcuts = Object.values(SELECTION_SHORTCUTS) }: {
  key: string;
  shortcuts?: readonly SelectionShortcut[];
  isAlt: boolean;
  isShift: boolean;
  isControl: boolean;
}) {
  const direction = ARROWS.get(key);
  const shortcut = shortcuts.find(candidate =>
    candidate.chord.isAlt === isAlt && candidate.chord.isShift === isShift &&
    candidate.chord.isControl === isControl);
  const isShortcut = direction !== undefined && shortcut !== undefined;
  if (!isShortcut) {
    return undefined;
  }

  return {
    kind: shortcut.kind,
    delta: {
      x: direction.x * shortcut.step,
      y: direction.y * shortcut.step
    }
  } satisfies SelectorEvent;
}
