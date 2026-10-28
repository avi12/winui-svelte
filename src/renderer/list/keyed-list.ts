// Syncs a list to a wanted key order touching only what changed, so a panel's
// add/delete transition plays for exactly the rows that came or went, not for
// every row a clear-and-refill would recreate.

/** A list that can be read and changed by position. */
export interface KeyedItems<T> {
  readonly size: number;
  getAt(index: number): T;
  removeAt(index: number): void;
  insertAt(index: number, item: T): void;
}

/** A list to sync, and how to key, make and move its items. */
export interface KeyedList<T> {
  items: KeyedItems<T>;
  keyOf(item: T): string;
  create(key: string): T;
  // A collection's own Move lets a list animate a move as a reposition rather
  // than as a removal and an addition.
  move?(from: number, to: number): void;
}

/**
 * Brings a list to the wanted keys, in order, removing, inserting and moving
 * only the items that differ.
 *
 * @param options - The list to change, and the keys it should hold, in the order it should hold them.
 */
export function syncKeyed<T>({ list, wantedKeys }: {
  list: KeyedList<T>;
  wantedKeys: readonly string[];
}) {
  removeUnwanted({
    list,
    wanted: new Set(wantedKeys)
  });
  for (const [index, key] of wantedKeys.entries()) {
    place({
      list,
      key,
      index
    });
  }
}

function removeUnwanted<T>({ list, wanted }: {
  list: KeyedList<T>;
  wanted: Set<string>;
}) {
  for (let i = list.items.size - 1; i >= 0; i--) {
    const isWanted = wanted.has(list.keyOf(list.items.getAt(i)));
    if (!isWanted) {
      list.items.removeAt(i);
    }
  }
}

function keyAt<T>({ list, index }: {
  list: KeyedList<T>;
  index: number;
}) {
  const isInList = index < list.items.size;
  return isInList ? list.keyOf(list.items.getAt(index)) : undefined;
}

function canMove<T>(list: KeyedList<T>): list is KeyedList<T> & Required<Pick<KeyedList<T>, "move">> {
  return list.move !== undefined;
}

// Every key before `index` is already in place.
function place<T>({ list, key, index }: {
  list: KeyedList<T>;
  key: string;
  index: number;
}) {
  const isInPlace = keyAt({
    list,
    index
  }) === key;
  if (isInPlace) {
    return;
  }

  const existing = indexOf({
    list,
    key,
    start: index + 1
  });
  const isMissing = existing < 0;
  if (isMissing) {
    list.items.insertAt(index, list.create(key));
    return;
  }

  if (canMove(list)) {
    list.move(existing, index);
    return;
  }

  const item = list.items.getAt(existing);
  list.items.removeAt(existing);
  list.items.insertAt(index, item);
}

function indexOf<T>({ list, key, start }: {
  list: KeyedList<T>;
  key: string;
  start: number;
}) {
  for (let i = start; i < list.items.size; i++) {
    const isKeyFound = list.keyOf(list.items.getAt(i)) === key;
    if (isKeyFound) {
      return i;
    }
  }

  return -1;
}
