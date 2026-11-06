const VAR_CALL = /var\(\s*(--[\w-]*)/gu;

/**
 * A custom property written inside `var(...)`: where its name starts and ends in the text, and the name.
 */
export interface ResourceReference {
  start: number;
  end: number;
  property: string;
}

/**
 * The `var(--name)` whose name the offset is in or at the end of; undefined where the offset is anywhere else.
 */
export function referenceAt({ text, offset }: {
  text: string;
  offset: number;
}) {
  for (const call of text.matchAll(VAR_CALL)) {
    const property = call[1] ?? "";
    const end = call.index + call[0].length;
    const start = end - property.length;
    const isAtName = start <= offset && offset <= end;
    if (isAtName) {
      return {
        start,
        end,
        property
      } satisfies ResourceReference;
    }
  }

  return undefined;
}
