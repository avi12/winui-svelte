/**
 * The `Error` behind whatever was thrown: the error itself, or one that
 * carries the text of a thrown string or other value.
 *
 * @param thrown - What a `catch` caught.
 * @returns An `Error` to keep, show or rethrow.
 */
export function errorOf(thrown: unknown) {
  return thrown instanceof Error ? thrown : new Error(String(thrown));
}
