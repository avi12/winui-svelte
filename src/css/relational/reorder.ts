/** The children of a container, in the order the markup writes them and the order `order` gives them. */
export interface Move {
  /** Where each child is in the source, in the order written. */
  ranges: readonly {
    start: number;
    end: number;
  }[];
  /** The written index of the child that goes at each place. */
  sequence: readonly number[];
}

interface Replacement {
  start: number;
  end: number;
  text: string;
}

/**
 * Writes each move's children in their new order: the text between children
 * stays where it is. The ranges are offsets of the source before `shift`
 * (what the edits made of an offset) was applied.
 */
export function applyMoves({ text, moves, shift }: {
  text: string;
  moves: readonly Move[];
  shift(offset: number): number;
}) {
  // A container inside a moved child moves first, so the outer ranges still hold.
  const innerFirst = moves.toSorted((first, second) => span(first) - span(second));
  let result = text;
  for (const move of innerFirst) {
    const slices = move.ranges.map(({ start, end }) => result.slice(shift(start), shift(end)));
    const replacements = move.ranges.map(({ start, end }, i) => ({
      start: shift(start),
      end: shift(end),
      text: slices[move.sequence[i] ?? i] ?? ""
    } satisfies Replacement));
    for (const replacement of replacements.toReversed()) {
      result = result.slice(0, replacement.start) + replacement.text + result.slice(replacement.end);
    }
  }

  return result;
}

function span(move: Move) {
  const first = move.ranges[0];
  const last = move.ranges.at(-1);
  const isEmpty = first === undefined || last === undefined;
  return isEmpty ? 0 : last.end - first.start;
}
