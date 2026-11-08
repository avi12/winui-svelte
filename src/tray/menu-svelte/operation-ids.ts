const ids = new WeakMap<object, string>();
let nextId = 1;

/**
 * A stable menu id for an operation, so its line keeps its place while it runs.
 *
 * @param operation - The operation.
 * @returns An id unique in the app.
 */
export function operationMenuId(operation: object) {
  const known = ids.get(operation);
  const isKnown = known !== undefined;
  if (isKnown) {
    return known;
  }

  const id = `operation-${nextId}`;
  nextId += 1;
  ids.set(operation, id);
  return id;
}
