import type { ExpandedBound } from "./expanded-keys.ts";
import { ExpandedKeys } from "./expanded-keys.ts";
import type { ItemNameProps, ItemRowsProps } from "./item-rows.svelte.ts";
import {
  keyBox,
  keyText,
  nameContainer,
  SLOT_ELEMENT,
  templateOf
} from "./item-rows.svelte.ts";
import type { SelectionBound, SelectionView } from "./key-selection.ts";
import { KeySelection, SelectionKind } from "./key-selection.ts";
import { KeyedRows, mountSnippetRow } from "./keyed-rows.svelte.ts";
import { KeyedTree } from "./keyed-tree.ts";
import type {
  ContainerContentChangingEventArgs,
  DependencyObject,
  TreeView
} from "#src/components/generated/bindings.js";
import {
  ContentControl,
  DataTemplate,
  FrameworkElement,
  ListViewBase,
  projectAs,
  TreeViewNode,
  TreeViewSelectionMode,
  VisualTreeHelper,
  XamlReader
} from "#src/components/generated/bindings.js";
import { untrack } from "svelte";

// What TreeView adds to the control: a tree of the app's items, shown by a row
// the app writes as a snippet.
//
// The control's nodes carry the items' keys, boxed strings, as their content.
// A node's children are made when the node is expanded (the control asks with
// Expanding, for a node that says it has children it has not made), so a tree
// that is mostly closed is only as big as what is open. The rows are the
// list's: the control draws its nodes in a ListView of its own (the part
// "ListControl", a TreeViewList), which reports each container it realizes
// (ContainerContentChanging); a row is mounted into the slot of the container's
// item template for the node's key, and ends when the container is recycled.

// The ListView a TreeView keeps in its template.
const LIST_PART = "ListControl";

const selectionKinds = new Map<TreeViewSelectionMode, SelectionKind>([
  [TreeViewSelectionMode.None, SelectionKind.NONE],
  [TreeViewSelectionMode.Single, SelectionKind.SINGLE],
  [TreeViewSelectionMode.Multiple, SelectionKind.MULTIPLE]
]);

/** What a tree component takes besides its control's properties: the items, their children and how a row shows one. */
export interface TreeHostProps<Item> extends ItemRowsProps<Item>, ItemNameProps<Item> {
  // The items under an item. The app's tree is read through this: a node is
  // made for an item when its parent is expanded.
  children: (item: Item) => readonly Item[];
  // The key of the selected item, in the single selection mode: bind it to
  // read the user's choice or to select an item. Undefined is no selection.
  // An item can be selected once its parent has been expanded.
  selectedKey?: string | undefined;
  // The keys of the selected items, in the tree's order, in the multiple
  // selection mode: selecting an item selects the items under it, which are in
  // this list too.
  selectedKeys?: string[] | undefined;
  // The keys of the expanded items, in the tree's order: bind it to read what
  // the user opened or to open items. A key the tree has no item for is kept.
  expandedKeys?: string[] | undefined;
  // The control, for what the control exposes and the component does not. The
  // cleanup runs when it goes.
  oncontrol?: (view: TreeView) => void | (() => void);
}

/** What a tree component binds: the selection and the expanded keys. */
export type TreeBound = SelectionBound & ExpandedBound;

// The first element below `parent` with this name, looking level by level.
function findNamed({ parent, name }: {
  parent: DependencyObject;
  name: string;
}) {
  const pending = [parent];
  for (let element = pending.shift(); element !== undefined; element = pending.shift()) {
    for (let i = 0; i < VisualTreeHelper.getChildrenCount(element); i++) {
      const child = VisualTreeHelper.getChild(element, i);
      const isFound = projectAs(child, FrameworkElement).name === name;
      if (isFound) {
        return child;
      }

      pending.push(child);
    }
  }

  return null;
}

class TreeHost<Item> {
  private readonly view: TreeView;
  private readonly props: TreeHostProps<Item>;
  private readonly rows: KeyedRows<Item>;
  private readonly tree: KeyedTree<Item, TreeViewNode>;
  private readonly expanded: ExpandedKeys;
  private readonly selection: KeySelection<TreeViewNode>;
  private readonly unsubscribe: Array<() => void> = [];
  private isSyncing = false;

  constructor({ view, props, bound }: {
    view: TreeView;
    props: TreeHostProps<Item>;
    bound: TreeBound;
  }) {
    this.view = view;
    this.props = props;
    this.rows = new KeyedRows(({ slot, entry }) => mountSnippetRow({
      slot,
      snippet: props.item,
      value: entry
    }));
    this.tree = new KeyedTree({
      items: {
        keyOf: item => props.key(item),
        childrenOf: item => props.children(item),
        isExpanded: key => this.expanded.has(key)
      },
      nodes: {
        create(key) {
          const node = new TreeViewNode();
          node.content = keyBox.box(key);
          return node;
        },
        keyOf: node => keyText(node.content)
      }
    });
    this.expanded = new ExpandedKeys({
      bound,
      order: () => this.tree.order
    });
    this.selection = new KeySelection({
      view: this.selectionView(),
      codec: {
        box: key => this.nodeOf(key),
        unbox: node => keyText(node.content)
      },
      bound,
      order: () => this.tree.order,
      isPaused: () => this.isSyncing
    });
    view.itemTemplate = projectAs(XamlReader.load(templateOf(SLOT_ELEMENT)), DataTemplate);
    this.unsubscribe.push(
      view.onExpanding((_sender, args) => this.expandedChanged({
        key: keyText(args.node.content),
        isExpanded: true
      })),
      view.onCollapsed((_sender, args) => this.expandedChanged({
        key: keyText(args.node.content),
        isExpanded: false
      })),
      view.onSelectionChanged(() => this.selection.changed())
    );
    $effect(() => {
      untrack(() => this.expanded.adopt());
      this.sync();
      untrack(() => this.selection.apply());
    });
    $effect(() => {
      const isAdopted = this.expanded.adopt();
      if (isAdopted) {
        untrack(() => {
          this.sync();
          this.selection.apply();
        });
      }
    });
    $effect(() => this.selection.apply());
  }

  // The selection as the control holds it: its nodes, found by the very nodes
  // the tree made.
  private selectionView() {
    const { view } = this;
    return {
      get kind() {
        return selectionKinds.get(view.selectionMode) ?? SelectionKind.NONE;
      },
      get selected() {
        const selected = view.selectedNodes;
        const isMissing = selected === null;
        if (isMissing) {
          throw new Error("the tree has no selected nodes vector");
        }

        return selected;
      },
      boxOf: key => this.nodeOf(key)
    } satisfies SelectionView<TreeViewNode>;
  }

  private nodeOf(key: string) {
    const node = this.tree.nodeOf(key);
    const isShown = node !== undefined;
    if (!isShown) {
      throw new Error(`the tree has no node for "${key}"`);
    }

    return node;
  }

  /**
   * Starts to show rows: the control's list reports each container it realizes
   * from here on, and the containers it made already show theirs.
   */
  listen(list: ListViewBase) {
    this.unsubscribe.push(list.onContainerContentChanging((_sender, args) => this.fill(args)));
    for (let i = 0; i < list.items.size; i++) {
      const container = list.containerFromIndex(i);
      const isRealized = container !== null;
      if (isRealized) {
        this.show({
          container: projectAs(container, FrameworkElement),
          node: projectAs(list.items.getAt(i), TreeViewNode)
        });
      }
    }
  }

  dispose() {
    for (const unsubscribe of this.unsubscribe.splice(0)) {
      unsubscribe();
    }

    this.rows.clear();
  }

  private sync() {
    const roots = this.view.rootNodes;
    const hasRoots = roots !== null;
    if (!hasRoots) {
      throw new Error("the tree has no root nodes collection");
    }

    this.syncing(() => this.tree.sync({
      roots,
      items: this.props.items ?? []
    }));
    this.rows.setEntries(this.tree.entries());
  }

  // The control reports what the nodes do meanwhile (a selection lost, a node
  // expanded to match the app's keys); none of it is the user's.
  private syncing(change: () => void) {
    this.isSyncing = true;
    try {
      change();
    } finally {
      this.isSyncing = false;
    }
  }

  // The user (or the app, through the control) expanded or collapsed a node.
  // The children are made while the control asks for them.
  private expandedChanged({ key, isExpanded }: {
    key: string;
    isExpanded: boolean;
  }) {
    if (this.isSyncing) {
      return;
    }

    this.expanded.toggled({
      key,
      isExpanded
    });
    this.syncing(() => this.tree.syncChildren(key));
    this.rows.setEntries(this.tree.entries());
  }

  private fill(args: ContainerContentChangingEventArgs) {
    const container = projectAs(args.itemContainer, FrameworkElement);
    if (args.inRecycleQueue) {
      this.rows.release(container);
      return;
    }

    this.show({
      container,
      node: projectAs(args.item, TreeViewNode)
    });
  }

  // The row goes in the slot the item template made.
  private show({ container, node }: {
    container: FrameworkElement;
    node: TreeViewNode;
  }) {
    const item = this.rows.show({
      container,
      slot: projectAs(projectAs(container, ContentControl).contentTemplateRoot, ContentControl),
      key: keyText(node.content)
    });
    nameContainer({
      container,
      item,
      props: this.props
    });
  }
}

// The ListView a TreeView draws its nodes in: found once the control has its
// template, which it gets when it is loaded.
function listIn(view: TreeView) {
  const found = findNamed({
    parent: view,
    name: LIST_PART
  });
  return found === null ? null : projectAs(found, ListViewBase);
}

/**
 * Connects the control to the props: call it from the component's control
 * attachment.
 */
export function attachTree<Item>({ view, props, bound }: {
  view: TreeView;
  props: TreeHostProps<Item>;
  bound: TreeBound;
}) {
  const host = new TreeHost({
    view,
    props,
    bound
  });
  const releases: Array<() => void> = [];
  function listenWhenFound() {
    const list = listIn(view);
    const isFound = list !== null;
    if (isFound) {
      host.listen(list);
    }

    return isFound;
  }

  const isFoundNow = listenWhenFound();
  if (!isFoundNow) {
    releases.push(view.onceLoaded(listenWhenFound));
  }

  const releaseControl = props.oncontrol?.(view);
  return {
    dispose() {
      releaseControl?.();
      for (const release of releases) {
        release();
      }

      host.dispose();
    }
  };
}
