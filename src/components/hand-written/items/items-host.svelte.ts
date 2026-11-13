import { GroupHeaders } from "./group-headers.ts";
import type { GroupingProps } from "./grouping.ts";
import type { ItemNameProps, ItemRowsProps } from "./item-rows.svelte.ts";
import {
  ItemRows,
  keyBox,
  keyText,
  nameContainer,
  SLOT_ELEMENT,
  templateOf
} from "./item-rows.svelte.ts";
import type { SelectedVector, SelectionBound, SelectionView } from "./key-selection.ts";
import { KeySelection, SelectionKind } from "./key-selection.ts";
import { movedIndex, MoveDirection, sameOrder } from "./reorder.ts";
import type { ContainerContentChangingEventArgs, ListViewBase } from "#src/components/generated/bindings.js";
import {
  ContentControl,
  Control,
  DataTemplate,
  DependencyObject,
  FocusState,
  KeyRoutedEventArgs,
  ListViewSelectionMode,
  projectAs,
  VirtualKey,
  VisualStateManager,
  VisualTreeHelper,
  XamlReader
} from "#src/components/generated/bindings.js";
import type { BoxedValue } from "#src/native-value.js";
import { untrack } from "svelte";

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

const selectionKinds = new Map<ListViewSelectionMode, SelectionKind>([
  [ListViewSelectionMode.None, SelectionKind.NONE],
  [ListViewSelectionMode.Single, SelectionKind.SINGLE],
  [ListViewSelectionMode.Multiple, SelectionKind.MULTIPLE],
  [ListViewSelectionMode.Extended, SelectionKind.MULTIPLE]
]);

/** What a list component takes besides its control's properties: the items and how a row shows one. */
export interface ItemsHostProps<Item> extends ItemRowsProps<Item>, ItemNameProps<Item>, Partial<GroupingProps<Item>> {
  // The user drags an item to a new place (the control's own reorder). Not in
  // a grouped list (`groupBy`), where an item's place is its group's.
  reorderable?: boolean;
  // Alt+Up / Alt+Down moves the focused item one place. Not in a grouped list.
  keyboardReorder?: boolean;
  // The key of the selected item, in the single selection modes: bind it to
  // read the user's choice or to select an item. It follows the item when the
  // items reorder, and is cleared when the item goes. Undefined is no selection.
  selectedKey?: string | undefined;
  // The keys of the selected items, in the list's order, in the multiple
  // selection modes (the same as selectedKey in the single one).
  selectedKeys?: string[] | undefined;
  // The keys in the order the user left them in, after a drag or a keyboard
  // move. The list keeps that order until `items` changes; an app that keeps
  // its own order updates `items` from it.
  onreorder?: (order: string[]) => void;
  // The control, for what the control exposes and the component does not
  // (item transitions, scrolling, focus). The cleanup runs when it goes.
  oncontrol?: (view: ListViewBase) => void | (() => void);
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
  // once, reported to onreorder, the focus following it.
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
  private readonly rows: ItemRows<Item>;
  private readonly selection: KeySelection<BoxedValue>;
  private readonly unsubscribe: (() => void)[] = [];
  private readonly groupHeaders: GroupHeaders<Item> | undefined;
  private isDragging = false;

  constructor({ view, props, selection }: {
    view: ListViewBase;
    props: ItemsHostProps<Item>;
    selection: SelectionBound;
  }) {
    this.view = view;
    this.props = props;
    this.rows = new ItemRows({
      props,
      onSynced: () => {
        this.resetRowStates();
        untrack(() => this.selection.apply());
      }
    });
    this.selection = new KeySelection({
      view: this.selectionView(),
      codec: keyBox,
      bound: selection,
      order: () => this.rows.order,
      isPaused: () => this.rows.isChanging || this.isDragging
    });
    view.itemTemplate = projectAs(XamlReader.load(templateOf(SLOT_ELEMENT)), DataTemplate);
    view.itemsSource = this.rows.source;

    if (this.isGrouped) {
      this.groupHeaders = new GroupHeaders({
        view,
        rows: this.rows
      });
    }

    this.unsubscribe.push(
      view.onContainerContentChanging((_sender, args) => this.fill(args)),
      view.onDragItemsStarting(() => {
        this.isDragging = true;
      }),
      view.onDragItemsCompleted(() => this.dragCompleted()),
      view.onSelectionChanged(() => this.selection.changed()),
      // Preview: the list's items take the arrow keys to move focus before a
      // bubbling KeyDown would see them.
      view.onPreviewKeyDown((_sender, args) => this.keyDown(projectAs(args, KeyRoutedEventArgs)))
    );
    $effect(() => this.selection.apply());
    $effect(() => {
      const isReorderable = props.reorderable;
      const isSpecified = isReorderable !== undefined;
      if (isSpecified) {
        const canReorder = isReorderable && !this.isGrouped;
        view.canReorderItems = canReorder;
        view.canDragItems = canReorder;
        view.allowDrop = canReorder;
      }
    });
  }

  // The selection as the control holds it: boxed keys, found by the very boxes
  // the control's items are. A single-selection list refuses to change its
  // SelectedItems (E_UNEXPECTED), so there it is written through SelectedItem.
  private selectionView() {
    const { view, rows } = this;
    return {
      get kind() {
        return selectionKinds.get(view.selectionMode) ?? SelectionKind.NONE;
      },
      get selected() {
        const selected = view.selectedItems;
        const isMissing = selected === null;
        if (isMissing) {
          throw new Error("the list has no selected items vector");
        }

        const isSingle = selectionKinds.get(view.selectionMode) === SelectionKind.SINGLE;
        if (!isSingle) {
          return selected;
        }

        return {
          get size() {
            return selected.size;
          },
          getAt: index => selected.getAt(index),
          clear() {
            view.selectedItem = null;
          },
          append(boxedKey) {
            view.selectedItem = boxedKey;
          }
        } satisfies SelectedVector<BoxedValue>;
      },
      boxOf: key => rows.boxOf(key)
    } satisfies SelectionView<BoxedValue>;
  }

  dispose() {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }

    this.groupHeaders?.dispose();
    this.rows.clear();
  }

  // A container reports the key it shows now. The row goes in the slot its
  // item template made: setting the container's own Content does not hold,
  // the list writes the item over it.
  private fill(args: ContainerContentChangingEventArgs) {
    const container = args.itemContainer;
    if (args.inRecycleQueue) {
      this.rows.release(container);
      return;
    }

    this.rows.realized(args.itemIndex);

    const key = keyText(args.item);
    const item = this.rows.show({
      container,
      slot: projectAs(container.contentTemplateRoot, ContentControl),
      key
    });
    nameContainer({
      container,
      item,
      props: this.props
    });
  }

  private get isGrouped() {
    return this.props.groupBy !== undefined;
  }

  private dragCompleted() {
    this.isDragging = false;
    // WinUI can leave the dragged (or last pressed) row in its Pressed or
    // PointerOver look after a drop; every row goes back to Normal.
    this.resetRowStates();
    const order = this.rows.readOrder();
    const isMoved = !sameOrder({
      first: order,
      second: this.rows.order
    });
    if (isMoved) {
      this.rows.adoptOrder(order);
      this.props.onreorder?.([...order]);
    }

    this.selection.apply();
  }

  private keyDown(event: KeyRoutedEventArgs) {
    const isKeyboardReorder = this.props.keyboardReorder === true && !this.isGrouped;
    const direction = isKeyboardReorder ? directionOf(event) : null;
    const hasDirection = direction !== null;
    if (!hasDirection) {
      return;
    }

    const index = this.focusedIndex(event.originalSource);
    const key = this.rows.order[index];
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
    const index = this.rows.order.indexOf(key);
    const isListed = index >= 0;
    if (isListed) {
      this.view.scrollIntoView(this.rows.boxOf(key));
    }
  }

  // Moves in the list itself, so the move is seen at once and the focus can
  // follow; the app hears of it as of a drag.
  move({ key, direction }: {
    key: string;
    direction: MoveDirection;
  }) {
    const target = movedIndex({
      order: this.rows.order,
      key,
      direction
    });
    const isMovable = target !== null;
    if (!isMovable) {
      return;
    }

    this.rows.moveKey({
      key,
      target
    });
    this.selection.apply();
    this.props.onreorder?.([...this.rows.order]);
    this.focus(key);
  }

  // The container is made when the list lays out, so it is brought into view
  // and laid out first.
  focus(key: string) {
    const index = this.rows.order.indexOf(key);
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
export function attachItems<Item>({ view, props, selection }: {
  view: ListViewBase;
  props: ItemsHostProps<Item>;
  selection: SelectionBound;
}) {
  const host = new ItemsHost({
    view,
    props,
    selection
  });
  const releaseControl = props.oncontrol?.(view);
  return {
    handle: host,
    dispose() {
      releaseControl?.();
      host.dispose();
    }
  };
}
