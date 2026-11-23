export interface TextEdit {
  start: number;
  end: number;
  text: string;
}

/**
 * The text with every edit applied, the last ones first so that the offsets of the others hold.
 */
export function applyEdits({ text, edits }: {
  text: string;
  edits: TextEdit[];
}) {
  const ordered = edits.toSorted((first, second) => second.start - first.start || second.end - first.end);
  let current = text;
  for (const edit of ordered) {
    current = `${current.slice(0, edit.start)}${edit.text}${current.slice(edit.end)}`;
  }

  return current;
}
