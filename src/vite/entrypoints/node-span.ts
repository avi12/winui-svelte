function offsetOf({ node, key }: {
  node: unknown;
  key: "start" | "end";
}) {
  const isObject = typeof node === "object" && node !== null;
  const value = isObject ? new Map(Object.entries(node)).get(key) : undefined;
  return typeof value === "number" ? value : undefined;
}

/**
 * Where a syntax node sits in the source. The parser sets `start` and `end` on
 * every node, but the ESTree types leave them out.
 *
 * @param node - A node of the parsed file.
 * @returns Its first and last offsets.
 * @throws {Error} When the node carries no offsets.
 */
export function spanOf(node: unknown) {
  const start = offsetOf({
    node,
    key: "start"
  });
  const end = offsetOf({
    node,
    key: "end"
  });
  const isMissing = start === undefined || end === undefined;
  if (isMissing) {
    throw new Error("the parser gave a node with no offsets");
  }

  return {
    start,
    end
  };
}
