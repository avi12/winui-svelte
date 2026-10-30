import { SvelteMap } from "svelte/reactivity";

/**
 * A reactive collection of items by key, in the order they arrived. Read
 * `items` in `{#each collection.items as item (item.id)}`; the block updates
 * as items come, change and go.
 */
export interface KeyedCollection<Item> extends Iterable<Item> {
  /** The items, in arrival order. A new array on each read. */
  readonly items: readonly Item[];

  /** The keys, in arrival order. */
  readonly keys: readonly string[];
  readonly size: number;
  get(key: string): Item | undefined;
  has(key: string): boolean;
}

/**
 * Makes a reactive keyed collection and the functions that change it. The
 * source of the items keeps the writers; the app gets only the `collection`.
 *
 * @returns The read-only collection, and the writers for its source.
 */
export function createKeyedCollection<Item>() {
  const entries = new SvelteMap<string, Item>();
  const collection = {
    get items() {
      return [...entries.values()];
    },
    get keys() {
      return [...entries.keys()];
    },
    get size() {
      return entries.size;
    },
    get: (key: string) => entries.get(key),
    has: (key: string) => entries.has(key),
    [Symbol.iterator]: () => entries.values()
  } satisfies KeyedCollection<Item>;
  return {
    collection,
    put({ key, item }: {
      key: string;
      item: Item;
    }) {
      entries.set(key, item);
    },
    remove(key: string) {
      entries.delete(key);
    },
    clear() {
      entries.clear();
    }
  };
}
