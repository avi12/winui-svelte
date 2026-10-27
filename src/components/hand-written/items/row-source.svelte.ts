// The item a mounted row shows. Raw state: the item is the app's object, not
// a copy Svelte wraps (an app that keeps its rows in $state has them wrapped
// already, and its row components then follow each field).
import type { Snippet } from "svelte";

/** Holds the item a mounted row shows, as raw state a row component reads. */
export class RowSource<Item> {
  current: Item;

  constructor(item: Item) {
    this.current = $state.raw(item);
  }
}

/**
 * Row.svelte's props: the app's item snippet and the item it shows.
 */
export interface RowProps<Item> {
  snippet: Snippet<[Item]>;
  source: RowSource<Item>;
}
