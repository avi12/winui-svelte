import type { TextHighlighter } from "#src/components/generated/bindings.js";
import type { Linker } from "#src/components/runtime.svelte.js";

// Hand-written prop of the generated TextHighlighter: WinUI's Ranges is a
// read-only collection of structs, which the generator leaves out (tables.ts,
// extendedClasses). The array replaces the ranges the highlighter holds.
//
//   <TextHighlighter background="#ffee00" ranges={[{ startIndex: 0, length: 5 }]} />

/** A run of characters to highlight: where it starts and how many it covers. */
export interface HighlightRange {
  startIndex: number;
  length: number;
}

/** The props the metadata cannot give the generated TextHighlighter. */
export interface TextHighlighterExtras {
  ranges?: readonly HighlightRange[];
}

/** Links the TextHighlighter's `ranges` prop to the ranges it holds. */
export function linkTextHighlighterExtras({ control, props, link }: {
  control: TextHighlighter;
  props: TextHighlighterExtras;
  link: Linker;
}) {
  link.property({
    props,
    key: "ranges",
    apply(ranges) {
      const held = control.ranges;
      held?.clear();
      for (const range of ranges) {
        held?.append(range);
      }
    }
  });
}
