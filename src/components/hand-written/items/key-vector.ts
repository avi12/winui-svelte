import { syncKeyed } from "#src/renderer/list/keyed-list.js";

// The vector of keys a list control shows (a WinRT IVector of boxed strings),
// brought to a wanted order of keys.

/** The part of WinRT's IVector this module uses; its method shapes are WinRT's. */
export interface KeyVector<Boxed> {
  readonly size: number;
  getAt(index: number): Boxed;
  removeAt(index: number): void;
  insertAt(index: number, boxedKey: Boxed): void;
  replaceAll(boxedKeys: Boxed[]): void;
}

/**
 * How a key is held in the vector.
 */
export interface KeyBox<Boxed> {
  box(key: string): Boxed;
  unbox(boxedKey: Boxed): string;
}

/** The first key that appears earlier in the list, or undefined when every key is unique. */
export function duplicateKey(keys: readonly string[]) {
  return keys.find((key, index) => keys.indexOf(key) !== index);
}

/**
 * An empty vector is filled in one go (one reset for the list to lay out,
 * rather than an insertion each); otherwise only the keys that came, went or
 * moved are touched, so the list animates exactly those.
 */
export function syncKeyVector<Boxed>({ vector, codec, wanted }: {
  vector: KeyVector<Boxed>;
  codec: KeyBox<Boxed>;
  wanted: readonly string[];
}) {
  const isEmpty = vector.size === 0;
  if (isEmpty) {
    vector.replaceAll(wanted.map(key => codec.box(key)));
    return;
  }

  syncKeyed({
    items: {
      get size() {
        return vector.size;
      },
      getAt: index => codec.unbox(vector.getAt(index)),
      removeAt: index => vector.removeAt(index),
      insertAt: (index, key) => vector.insertAt(index, codec.box(key))
    },
    keyOf: key => key,
    create: key => key
  }, wanted);
}
