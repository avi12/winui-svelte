import type { KeyBox } from "./key-vector.ts";
import { syncKeyVector } from "./key-vector.ts";
import {
  CollectionViewSource,
  IObservableVector_Object,
  ItemsControl,
  projectAs,
  XamlReader
} from "#src/components/generated/bindings.js";
import type { BoxedValue } from "#src/native-value.js";
import { syncKeyed } from "#src/renderer/list/keyed-list.js";

// The groups of a ListView or GridView, as WinUI's own grouping wants them: a
// CollectionViewSource with IsSourceGrouped over a vector of group objects,
// each of which holds the items of its group in the property ItemsPath names.
// WinUI never asks a JavaScript object for ICollectionViewGroup, so the group
// objects are ItemsControls, a WinUI class WinUI itself reads `Items` from, and
// their items are the boxed keys. The view makes the group headers (a
// ListViewHeaderItem each, which sticks to the top of the list) and groups the
// containers under them.

const ITEMS_PATH = "Items";
const SOURCE_XAML = "<CollectionViewSource xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\" "
  + `IsSourceGrouped="True" ItemsPath="${ITEMS_PATH}"/>`;

/** A group to show: its key and the keys of its items, in order. */
export interface KeyedGroup {
  readonly key: string;
  readonly itemKeys: readonly string[];
}

interface GroupState {
  readonly control: ItemsControl;
  keys: readonly string[];
  readonly boxes: Map<string, BoxedValue>;
}

/** The groups a list shows, kept in step with the keys the app's items have. */
export class NativeGroups {
  /** What the list's `itemsSource` is set to. */
  readonly view;
  private readonly codec: KeyBox<BoxedValue>;
  private readonly groups = IObservableVector_Object.create([]);
  private readonly states = new Map<string, GroupState>();
  private groupKeys: string[] = [];

  constructor(codec: KeyBox<BoxedValue>) {
    this.codec = codec;
    const source = projectAs(XamlReader.load(SOURCE_XAML), CollectionViewSource);
    source.source = this.groups;
    this.view = source.view;
  }

  /** The key of the group at this place in the list. */
  keyAt(index: number) {
    const key = this.groupKeys[index];
    const isMissing = key === undefined;
    if (isMissing) {
      throw new Error(`the list has no group at ${index}`);
    }

    return key;
  }

  /** The box the list holds for the item with this key, by which it finds the item. */
  boxOf(itemKey: string) {
    for (const state of this.states.values()) {
      const box = state.boxes.get(itemKey);
      const isHeld = box !== undefined;
      if (isHeld) {
        return box;
      }
    }

    return undefined;
  }

  /** Brings the groups, and the items in them, to these, touching only what changed. */
  sync(wanted: readonly KeyedGroup[]) {
    // A group is filled before the view sees it: the view reads a group's
    // items when the group arrives.
    for (const { key, itemKeys } of wanted) {
      this.fill({
        state: this.stateOf(key),
        itemKeys
      });
    }

    const vector = this.groups;
    syncKeyed({
      list: {
        items: {
          get size() {
            return vector.size;
          },
          getAt: index => this.keyAt(index),
          removeAt: index => {
            vector.removeAt(index);
            this.states.delete(this.keyAt(index));
            this.groupKeys.splice(index, 1);
          },
          insertAt: (index, key) => {
            vector.insertAt(index, this.stateOf(key).control);
            this.groupKeys.splice(index, 0, key);
          }
        },
        keyOf: key => key,
        create: key => key
      },
      wantedKeys: wanted.map(({ key }) => key)
    });
  }

  private stateOf(key: string) {
    const known = this.states.get(key);
    if (known) {
      return known;
    }

    const state: GroupState = {
      control: new ItemsControl(),
      keys: [],
      boxes: new Map()
    };
    this.states.set(key, state);
    return state;
  }

  private fill({ state, itemKeys }: {
    state: GroupState;
    itemKeys: readonly string[];
  }) {
    syncKeyVector({
      vector: state.control.items,
      codec: this.codec,
      wanted: itemKeys
    });
    state.keys = itemKeys;
    state.boxes.clear();
    for (const [index, key] of itemKeys.entries()) {
      state.boxes.set(key, state.control.items.getAt(index));
    }
  }
}
