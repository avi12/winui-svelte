import type { Keyframe } from "#src/renderer/host/keyframes.js";

// The keyframes of `animate()` as the web writes them: a list of keyframes, or
// an object of property value lists. The Web Animations API and the scroll
// timelines read them alike.

const KEYFRAME_OFFSET = "offset";

type PropertyValues = ReadonlyArray<string | number | null> | string | number | null;

/** The keyframes of `animate()`: a list of them, or properties with the list of their values. */
export type KeyframeInput = readonly Keyframe[] | Record<string, PropertyValues>;

function isKeyframeList(input: KeyframeInput): input is readonly Keyframe[] {
  return Array.isArray(input);
}

/**
 * The keyframes of `animate()` as a list of keyframes, whichever form they were written in.
 *
 * @param input - A list of keyframes, an object of property value lists, or null.
 * @returns One object for each keyframe.
 */
export function normalizeKeyframes(input: KeyframeInput | null) {
  const isEmpty = input === null;
  if (isEmpty) {
    return [];
  }

  if (isKeyframeList(input)) {
    return input.map(keyframe => ({ ...keyframe }));
  }

  const properties = Object.entries(input).filter(([name]) => name !== KEYFRAME_OFFSET);
  const lists = properties.map(([name, values]) => [name, [values].flat()] as const);
  const count = Math.max(0, ...lists.map(([, values]) => values.length));
  return Array.from({ length: count }, (_, i) => Object.fromEntries(
    lists.flatMap(([name, values]) => {
      const value = values[Math.min(i, values.length - 1)];
      return value === undefined ? [] : [[name, value]];
    })
  ));
}
