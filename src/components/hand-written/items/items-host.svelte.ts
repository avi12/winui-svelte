import type { KeyBox } from "./key-vector.ts";
import { duplicateKey, syncKeyVector } from "./key-vector.ts";
import type { LiveRow } from "./live-rows.ts";
import { LiveRows } from "./live-rows.ts";
import { movedIndex, MoveDirection, sameOrder } from "./reorder.ts";
import type { RowProps } from "./row-source.svelte.ts";
import { RowSource } from "./row-source.svelte.ts";
import Row from "./Row.svelte";
import { DynWinRtType, DynWinRtValue, unboxObject } from "@microsoft/dynwinrt";
import type {
  ContainerContentChangingEventArgs,
  FrameworkElement,
  ListViewBase
} from "#src/components/generated/bindings.js";
import {
  AutomationProperties,
  ContentControl,
  Control,
  DataTemplate,
  DependencyObject,
  FocusState,
  IVector_Object,
  KeyRoutedEventArgs,
  projectAs,
  PropertyValue,
  VirtualKey,
  VisualStateManager,
  VisualTreeHelper,
  XamlReader
} from "#src/components/generated/bindings.js";
import type { BoxedValue } from "#src/native-value.js";
import { mountControl } from "#src/renderer/host/mount.svelte.js";
import type { Snippet } from "svelte";

// What ListView and GridView add to the control: a list of the app's items,
// shown by a row the app writes as a snippet.
//
// The control's items are the rows' keys, boxed strings, not the items: the
// built-in drag reorder only commits a move to a list of plain values, and a
// key is all a container needs to find its row. Each container WinUI realizes
// reports its key (ContainerContentChanging), and a row is mounted into the
// slot of its item template for it; a container that goes to the recycle queue
// ends its row. So only the containers on screen have rows, however long the
// list is.

const NORMAL_STATE = "Normal";
const SLOT_TEMPLATE = "<DataTemplate xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\">"
  + "<ContentControl IsTabStop=\"False\" HorizontalContentAlignment=\"Stretch\" "
  + "HorizontalAlignment=\"Stretch\"/></DataTemplate>";

/** What a list component takes besides its control's properties: the items and how a row shows one. */
export interface ItemsHostProps<Item> {
  // The items, in the order they are shown.
  items?: readonly Item[];
  // An item's identity: unique in the list, and the same for the same thing
  // when the list changes, so its row is kept and only what changed moves.
  key: (item: Item) => string;
  // The row of an item.
  item?: Snippet<[Item]>;
  // The user drags an item to a new place (the control's own reorder).
  reorderable?: boolean;
  // Alt+Up / Alt+Down moves the focused item one place.
  keyboardReorder?: boolean;
  // The keys in the order the user left them in, after a drag or a keyboard
  // move. The list keeps that order until `items` changes; an app that keeps
  // its own order updates `items` from it.
  onReorder?: (order: string[]) => void;
  // The accessible name of an item's container.
  itemName?: (item: Item) => string;
  // The control, for what the control exposes and the component does not
  // (item transitions, scrolling, focus). The cleanup runs when it goes.
  onControl?: (view: ListViewBase) => void | (() => void);
}

function keyText(boxedKey: BoxedValue) {
  const value = unboxObject(boxedKey);
  return typeof value === "string" ? value : "";
}

const keyBox: KeyBox<BoxedValue> = {
  box: key => PropertyValue.createString(key),
  unbox: keyText
};

function createKeys() {
  return IVector_Object.from(DynWinRtValue.createVector([], DynWinRtType.object()));
}

function directionOf(event: KeyRoutedEventArgs) {
  if (!event.keyStatus.isMenuKeyDown) {
    return null;
  }

  const directions = new Map<number, MoveDirection>([
    [VirtualKey.Up, MoveDirection.UP],
    [VirtualKey.Down, MoveDirection.DOWN]
  ]);
  return directions.get(event.key) ?? null;
}

/**
 * What app code does with the list (`bind:handle`).
 */
export interface ListHandle {
  // Moves the item with this key one place, as Alt+Up / Alt+Down does: seen at
  // once, reported to onReorder, the focus following it.
  move({ key, direction }: {
    key: string;
    direction: MoveDirection;
  }): void;
  // Brings the item with this key into view.
  scrollToKey(key: string): void;
  // Brings the item into view and gives it the keyboard focus.
  focus(key: string): void;
}

class ItemsHost<Item> implements ListHandle {
  private readonly view: ListViewBase;
  private readonly props: ItemsHostProps<Item>;
  private readonly keys = createKeys();
  private readonly rows = new LiveRows<Item, FrameworkElement>();
  private readonly unsubscribe: Array<() => void> = [];
  private itemsByKey = new Map<string, Item>();
  // The keys in the order the list shows them.
  private order: string[] = [];
  private nextContainerId = 0;

  constructor(view: ListViewBase, props: ItemsHostProps<Item>) {
    this.view = view;
    this.props = props;
    view.itemTemplate = projectAs(XamlReader.load(SLOT_TEMPLATE), DataTemplate);
    view.itemsSource = this.keys;
    this.unsubscribe.push(
      view.onContainerContentChanging((_sender, args) => this.fill(args)),
      view.onDragItemsCompleted(() => this.dragCompleted()),
      // Preview: the list's items take the arrow keys to move focus before a
      // bubbling KeyDown would see them.
      view.onPreviewKeyDown((_sender, args) => this.keyDown(projectAs(args, KeyRoutedEventArgs)))
    );
    $effect(() => {
      this.sync(props.items ?? []);
    });
    $effect(() => {
      const isReorderable = props.reorderable;
      const isSpecified = isReorderable !== undefined;
      if (isSpecified) {
        view.canReorderItems = isReorderable;
        view.canDragItems = isReorderable;
        view.allowDrop = isReorderable;
      }
    });
  }

  dispose() {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }

    this.rows.clear();
  }

  private sync(items: readonly Item[]) {
    const keyed = items.map(item => [this.props.key(item), item] as const);
    const wanted = keyed.map(([key]) => key);
    const duplicate = duplicateKey(wanted);
    const hasDuplicate = duplicate !== undefined;
    if (hasDuplicate) {
      throw new Error(`two items have the key "${duplicate}"; a list's keys must be unique`);
    }

    this.itemsByKey = new Map(keyed);
    syncKeyVector({
      vector: this.keys,
      codec: keyBox,
      wanted
    });
    this.order = wanted;
    this.rows.refresh(key => this.itemsByKey.get(key));
    this.resetRowStates();
  }

  // A container reports the key it shows now. The row goes in the slot its
  // item template made: setting the container's own Content does not hold,
  // the list writes the item over it.
  private fill(args: ContainerContentChangingEventArgs) {
    const container = args.itemContainer;
    const containerId = this.containerId(container);
    if (args.inRecycleQueue) {
      this.rows.release(containerId);
      return;
    }

    const key = keyText(args.item);
    const item = this.itemsByKey.get(key);
    const isKnown = item !== undefined;
    if (!isKnown) {
      return;
    }

    const slot = projectAs(container.contentTemplateRoot, ContentControl);
    this.rows.fill({
      containerId,
      container,
      key,
      item,
      create: () => this.mountRow({
        slot,
        item
      })
    });
    const name = this.props.itemName?.(item);
    const hasName = name !== undefined;
    if (hasName) {
      AutomationProperties.setName(container, name);
    }
  }

  // WinUI hands back a new wrapper for the same container, so a container is
  // known by an id kept in its Tag.
  private containerId(container: FrameworkElement) {
    const known = container.tag === null ? null : unboxObject(container.tag);
    const isKnown = typeof known === "string";
    if (isKnown) {
      return known;
    }

    const id = `row-${this.nextContainerId}`;
    this.nextContainerId++;
    container.tag = PropertyValue.createString(id);
    return id;
  }

  private mountRow({ slot, item }: {
    slot: ContentControl;
    item: Item;
  }) {
    const snippet = this.props.item;
    const hasSnippet = snippet !== undefined;
    if (!hasSnippet) {
      const emptyRow: LiveRow<Item> = {
        update: () => undefined,
        unmount: () => undefined
      };
      return emptyRow;
    }

    const source = new RowSource(item);
    const mounted = mountControl<RowProps<Item>>({
      component: Row,
      props: {
        snippet,
        source
      }
    });
    slot.content = mounted.root;
    const row: LiveRow<Item> = {
      update(next) {
        const isChanged = source.current !== next;
        if (isChanged) {
          source.current = next;
        }
      },
      unmount() {
        slot.content = null;
        mounted.unmount();
      }
    };
    return row;
  }

  private dragCompleted() {
    // WinUI can leave the dragged (or last pressed) row in its Pressed or
    // PointerOver look after a drop; every row goes back to Normal.
    this.resetRowStates();
    const order = this.readOrder();
    const isMoved = !sameOrder({
      first: order,
      second: this.order
    });
    if (isMoved) {
      this.order = order;
      this.props.onReorder?.([...order]);
    }
  }

  private readOrder() {
    const order: string[] = [];
    for (let i = 0; i < this.keys.size; i++) {
      order.push(keyText(this.keys.getAt(i)));
    }

    return order;
  }

  private keyDown(event: KeyRoutedEventArgs) {
    const direction = this.props.keyboardReorder === true ? directionOf(event) : null;
    const hasDirection = direction !== null;
    if (!hasDirection) {
      return;
    }

    const index = this.focusedIndex(event.originalSource);
    const key = this.order[index];
    const isItem = index >= 0 && key !== undefined;
    if (!isItem) {
      return;
    }

    event.handled = true;
    this.move({
      key,
      direction
    });
  }

  // The list finds the item by the very object it holds: a new box of the same
  // text is a different item to it.
  scrollToKey(key: string) {
    const index = this.order.indexOf(key);
    const isListed = index >= 0;
    if (isListed) {
      this.view.scrollIntoView(this.keys.getAt(index));
    }
  }

  // Moves in the list itself, so the move is seen at once and the focus can
  // follow; the app hears of it as of a drag.
  move({ key, direction }: {
    key: string;
    direction: MoveDirection;
  }) {
    const target = movedIndex({
      order: this.order,
      key,
      direction
    });
    const isMovable = target !== null;
    if (!isMovable) {
      return;
    }

    const boxedKey = PropertyValue.createString(key);
    this.keys.removeAt(this.order.indexOf(key));
    this.keys.insertAt(target, boxedKey);
    this.order = this.readOrder();
    this.props.onReorder?.([...this.order]);
    this.focus(key);
  }

  // The container is made when the list lays out, so it is brought into view
  // and laid out first.
  focus(key: string) {
    const index = this.order.indexOf(key);
    const isListed = index >= 0;
    if (!isListed) {
      return;
    }

    this.scrollToKey(key);
    this.view.updateLayout();
    const container = this.view.containerFromIndex(index);
    const hasContainer = container !== null;
    if (hasContainer) {
      projectAs(container, Control).focus(FocusState.Keyboard);
    }
  }

  // Focus is on the list item itself or on something inside it.
  private focusedIndex(focused: KeyRoutedEventArgs["originalSource"]) {
    let element: DependencyObject | null = focused === null ? null : projectAs(focused, DependencyObject);
    while (element !== null) {
      const index = this.view.indexFromContainer(element);
      const isItem = index >= 0;
      if (isItem) {
        return index;
      }

      element = VisualTreeHelper.getParent(element);
    }

    return -1;
  }

  private resetRowStates() {
    for (const container of this.rows.containers()) {
      VisualStateManager.goToState(projectAs(container, Control), NORMAL_STATE, false);
    }
  }
}

/**
 * Connects the control to the props: call it from the component's control
 * attachment.
 */
export function attachItems<Item>({ view, props }: {
  view: ListViewBase;
  props: ItemsHostProps<Item>;
}) {
  const host = new ItemsHost(view, props);
  const releaseControl = props.onControl?.(view);
  return {
    handle: host,
    dispose() {
      releaseControl?.();
      host.dispose();
    }
  };
}
