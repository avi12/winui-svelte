import type { LiveRow } from "./live-rows.ts";
import { LiveRows } from "./live-rows.ts";
import type { RowProps } from "./row-source.svelte.ts";
import { RowSource } from "./row-source.svelte.ts";
import Row from "./Row.svelte";
import { PropertyValue } from "#src/components/generated/bindings.js";
import type { ContentControl, FrameworkElement } from "#src/components/generated/bindings.js";
import { mountControl } from "#src/renderer/host/mount.svelte.js";
import { unboxed } from "#src/renderer/host/values.js";
import { untrack } from "svelte";
import type { Snippet } from "svelte";

// The rows of a virtualized control that shows the app's entries by keys: what
// every items host (a list, a tree) shares. A control reports which container
// shows which key (ListView and TreeView: ContainerContentChanging; a repeater:
// ElementPrepared), and a row is mounted into the container's slot for it. The
// control decides when; this class does the rest.

/** What the app shows in a row: how to mount it into a slot, for the entry a key stands for. */
export type RowMount<Entry> = (args: {
  slot: ContentControl;
  entry: Entry;
}) => LiveRow<Entry>;

/**
 * Mounts the app's snippet into the slot, showing `value`. Without a snippet
 * the slot stays empty.
 */
export function mountSnippetRow<Value>({ slot, snippet, value }: {
  slot: ContentControl;
  snippet: Snippet<[Value]> | undefined;
  value: Value;
}) {
  const hasSnippet = snippet !== undefined;
  if (!hasSnippet) {
    const emptyRow: LiveRow<Value> = {
      update: () => undefined,
      unmount: () => undefined
    };
    return emptyRow;
  }

  const source = new RowSource(value);
  const mounted = mountControl<RowProps<Value>>({
    component: Row,
    props: {
      snippet,
      source
    }
  });
  slot.content = mounted.root;
  // A hot update, or an {#if} in the snippet, makes a new root; the control
  // the container made around the slot is not a place a swap can find the old
  // root's parent in (that is the container's presenter, not the slot).
  mounted.onRootChange(root => {
    slot.content = root;
  });
  const row: LiveRow<Value> = {
    // Untracked: the effect that brings the rows up to date must not depend on
    // what a row shows, or a value that is new on every sync (a group) would
    // run it again for good.
    update: next => untrack(() => {
      const isChanged = source.current !== next;
      if (isChanged) {
        source.current = next;
      }
    }),
    unmount() {
      slot.content = null;
      mounted.unmount();
    }
  };
  return row;
}

/** The mounted rows of a control, and which entry each key stands for. */
export class KeyedRows<Entry> {
  private readonly rows = new LiveRows<Entry, FrameworkElement>();
  private readonly mount: RowMount<Entry>;
  // eslint-disable-next-line svelte/prefer-svelte-reactivity -- not component state
  private entries: ReadonlyMap<string, Entry> = new Map();
  private nextContainerId = 0;

  constructor(mount: RowMount<Entry>) {
    this.mount = mount;
  }

  /** The entries the keys stand for now; every live row shows what its key stands for. */
  setEntries(entries: ReadonlyMap<string, Entry>) {
    this.entries = entries;
    this.rows.refresh(key => entries.get(key));
  }

  /**
   * The container shows `key` in `slot`. Its row stays when the key is the
   * same, else a new one replaces it. The entry shown, or undefined for a key
   * the app has no entry for.
   */
  show({ container, slot, key }: {
    container: FrameworkElement;
    slot: ContentControl;
    key: string;
  }) {
    const entry = this.entries.get(key);
    const isKnown = entry !== undefined;
    if (!isKnown) {
      return undefined;
    }

    this.rows.fill({
      containerId: this.idOf(container),
      container,
      key,
      item: entry,
      create: () => this.mount({
        slot,
        entry
      })
    });
    return entry;
  }

  /** The container went to the recycle queue: its row ends. */
  release(container: FrameworkElement) {
    this.rows.release(this.idOf(container));
  }

  /** The containers that show a row now. */
  containers() {
    return this.rows.containers();
  }

  /** Ends every row. */
  clear() {
    this.rows.clear();
  }

  /**
   * The id of a container. WinUI hands back a new wrapper for the same
   * container, so a container is known by an id kept in its Tag.
   */
  idOf(container: FrameworkElement) {
    const known = unboxed(container.tag);
    const isKnown = typeof known === "string";
    if (isKnown) {
      return known;
    }

    const id = `row-${this.nextContainerId}`;
    this.nextContainerId++;
    container.tag = PropertyValue.createString(id);
    return id;
  }
}
