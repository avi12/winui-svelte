import type { SelectorEvent } from "./selector.ts";
import { SelectorEventKind } from "./selector.ts";
import type { SelectableWord, WordRange } from "./text-words.ts";
import { joinWords, wordAt, wordsBetween } from "./text-words.ts";

/** What a text selector knows: the words, and the press that is choosing among them. */
export interface TextSelectorState {
  readonly words: readonly SelectableWord[];

  /** The word the press began on. */
  readonly anchor: number | undefined;

  /** The word the pointer is on now. */
  readonly focus: number | undefined;
  readonly isDragging: boolean;
}

/** A chosen run of words and what it reads. */
export interface TextSelection {
  readonly range: WordRange;
  readonly text: string;
}

/**
 * The start of a text selector: nothing selected.
 *
 * @param words - The words, in reading order (see `selectableWords`).
 * @returns The state to feed `reduceTextSelector`.
 */
export function createTextSelector(words: readonly SelectableWord[]) {
  return {
    words,
    anchor: undefined,
    focus: undefined,
    isDragging: false
  } satisfies TextSelectorState;
}

/**
 * The next state after a pointer event, with the same events as
 * `reduceSelector`. A press on a word anchors there, a drag extends to the
 * nearest word, a press off every word clears.
 *
 * @param options - The state and the event.
 * @returns The next state.
 */
export function reduceTextSelector({ state, event }: {
  state: TextSelectorState;
  event: SelectorEvent;
}) {
  const isClear = event.kind === SelectorEventKind.clear;
  if (isClear) {
    return createTextSelector(state.words);
  }

  const isRelease = event.kind === SelectorEventKind.pointerUp;
  if (isRelease) {
    return {
      ...state,
      isDragging: false
    } satisfies TextSelectorState;
  }

  const isPress = event.kind === SelectorEventKind.pointerDown;
  if (isPress) {
    const pressed = wordAt({
      words: state.words,
      point: event.point
    });
    return {
      ...state,
      anchor: pressed,
      focus: pressed,
      isDragging: pressed !== undefined
    } satisfies TextSelectorState;
  }

  const isMove = event.kind === SelectorEventKind.pointerMove;
  const isDraggedMove = isMove && state.isDragging;
  if (!isDraggedMove) {
    return state;
  }

  return {
    ...state,
    focus: wordAt({
      words: state.words,
      point: event.point,
      reach: Infinity
    }) ?? state.focus
  } satisfies TextSelectorState;
}

/**
 * What the selector has chosen.
 *
 * @param state - The selector state.
 * @returns The range and its text, or undefined when nothing is chosen.
 */
export function textSelection(state: TextSelectorState) {
  const { anchor, focus, words } = state;
  const isUnchosen = anchor === undefined || focus === undefined;
  if (isUnchosen) {
    return undefined;
  }

  const range = wordsBetween({
    words,
    from: anchor,
    to: focus
  });
  const isNone = range === undefined;
  if (isNone) {
    return undefined;
  }

  return {
    range,
    text: joinWords({
      words,
      range
    })
  } satisfies TextSelection;
}
