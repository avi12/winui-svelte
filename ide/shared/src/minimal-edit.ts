import type { TextEdit } from "./text-edit.ts";

/**
 * The one edit that turns the text before into the text after: what they share at the start and at the end stays,
 * so that an editor keeps its cursors and folds outside the change.
 */
export function minimalEdit({ before, after }: {
  before: string;
  after: string;
}) {
  const limit = Math.min(before.length, after.length);
  let start = 0;
  while (start < limit && before.charAt(start) === after.charAt(start)) {
    start += 1;
  }

  let shared = 0;
  const room = limit - start;
  while (shared < room && before.at(-1 - shared) === after.at(-1 - shared)) {
    shared += 1;
  }

  return {
    start,
    end: before.length - shared,
    text: after.slice(start, after.length - shared)
  } satisfies TextEdit;
}
