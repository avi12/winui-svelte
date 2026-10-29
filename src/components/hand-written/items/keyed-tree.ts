import { duplicateKey } from "./key-vector.ts";
import type { KeyedItems } from "#src/renderer/list/keyed-list.js";
import { syncKeyed } from "#src/renderer/list/keyed-list.js";

// The nodes a tree control holds, kept in step with the app's tree of items.
// A node is made for an item once and kept for as long as the item stays under
// the same parent, so a reorder, an insertion or a removal changes exactly the
// nodes it concerns. A node's children are made only when they can be seen
// (its key is expanded) or already were; a collapsed node with children says
// it has some it has not made yet.

/** The part of a tree control's node this module uses (WinUI's TreeViewNode has all of it). */
export interface TreeNodeFace<Node> {
  isExpanded: boolean;
  hasUnrealizedChildren: boolean;
  readonly children: KeyedItems<Node> | null;
}

/** How the tree's nodes are made and told apart. */
export interface TreeNodeOps<Node> {
  /** A node for the key, with no children. */
  create(key: string): Node;
  /** The key a node was made for. */
  keyOf(node: Node): string;
}

/** What the app's tree is made of. */
export interface TreeItems<Item> {
  keyOf(item: Item): string;
  childrenOf(item: Item): readonly Item[];
  /** Whether the item with this key is expanded. */
  isExpanded(key: string): boolean;
}

interface TreeRecord<Item, Node> {
  item: Item;
  node: Node;
  // The keys of the children that have nodes, in order.
  childKeys: string[];
}

function levelOf<Node extends TreeNodeFace<Node>>(node: Node) {
  const { children } = node;
  const hasChildren = children !== null;
  if (!hasChildren) {
    throw new Error("a tree node has no children collection");
  }

  return children;
}

/** The nodes of a tree control and the items they stand for, by key. */
export class KeyedTree<Item, Node extends TreeNodeFace<Node>> {
  private readonly items: TreeItems<Item>;
  private readonly nodes: TreeNodeOps<Node>;
  private records = new Map<string, TreeRecord<Item, Node>>();
  private rootKeys: string[] = [];

  constructor({ items, nodes }: {
    items: TreeItems<Item>;
    nodes: TreeNodeOps<Node>;
  }) {
    this.items = items;
    this.nodes = nodes;
  }

  /**
   * Brings the nodes under `roots` to the app's items. Throws when two items
   * of the tree have the same key.
   */
  sync({ roots, items }: {
    roots: KeyedItems<Node>;
    items: readonly Item[];
  }) {
    this.records = new Map();
    this.rootKeys = this.syncLevel({
      level: roots,
      items
    });
  }

  /**
   * The item with this key was expanded or collapsed: brings its children to
   * the app's, making them if they can be seen now.
   */
  syncChildren(key: string) {
    const record = this.records.get(key);
    const isKnown = record !== undefined;
    if (!isKnown) {
      return;
    }

    this.forget(record.childKeys);
    record.childKeys = this.syncNodeChildren({
      key,
      record
    });
  }

  /** The keys that have nodes, in the order the tree shows them (a collapsed node's children after it). */
  get order() {
    const order: string[] = [];
    this.collect({
      keys: this.rootKeys,
      order
    });
    return order;
  }

  /** The item each key with a node stands for. */
  entries() {
    return new Map(Array.from(this.records, ([key, record]) => [key, record.item]));
  }

  /** The node of the key, or undefined when it has none. */
  nodeOf(key: string) {
    return this.records.get(key)?.node;
  }

  private collect({ keys, order }: {
    keys: readonly string[];
    order: string[];
  }) {
    for (const key of keys) {
      order.push(key);
      this.collect({
        keys: this.records.get(key)?.childKeys ?? [],
        order
      });
    }
  }

  // A TreeViewNode's collections take their changes one at a time: ReplaceAll
  // leaves a node's children empty and the control's list unchanged.
  private syncLevel({ level, items }: {
    level: KeyedItems<Node>;
    items: readonly Item[];
  }) {
    const keyed = items.map(item => [this.items.keyOf(item), item] as const);
    const keys = keyed.map(([key]) => key);
    this.assertUnique(duplicateKey(keys));
    syncKeyed({
      list: {
        items: level,
        keyOf: node => this.nodes.keyOf(node),
        create: key => this.nodes.create(key)
      },
      wantedKeys: keys
    });

    for (const [index, [key, item]] of keyed.entries()) {
      const record: TreeRecord<Item, Node> = {
        item,
        node: level.getAt(index),
        childKeys: []
      };
      this.assertUnique(this.records.has(key) ? key : undefined);
      this.records.set(key, record);
      record.childKeys = this.syncNodeChildren({
        key,
        record
      });
    }

    return keys;
  }

  // A key cannot be that of another item of the tree, in this level or not.
  private assertUnique(duplicate: string | undefined) {
    const hasDuplicate = duplicate !== undefined;
    if (hasDuplicate) {
      throw new Error(`two items have the key "${duplicate}"; a tree's keys must be unique`);
    }
  }

  private syncNodeChildren({ key, record }: {
    key: string;
    record: TreeRecord<Item, Node>;
  }) {
    const { node } = record;
    const level = levelOf(node);
    const children = this.items.childrenOf(record.item);
    const hasChildren = children.length > 0;
    if (!hasChildren) {
      this.clear(level);
      this.markUnrealized({
        node,
        hasUnrealizedChildren: false
      });
      return [];
    }

    const isExpanded = this.items.isExpanded(key);
    const isRealized = level.size > 0 || isExpanded;
    this.markUnrealized({
      node,
      hasUnrealizedChildren: !isRealized
    });

    if (!isRealized) {
      return [];
    }

    const childKeys = this.syncLevel({
      level,
      items: children
    });
    const isExpandedAsWanted = node.isExpanded === isExpanded;
    if (!isExpandedAsWanted) {
      node.isExpanded = isExpanded;
    }

    return childKeys;
  }

  private clear(level: KeyedItems<Node>) {
    for (let i = level.size - 1; i >= 0; i--) {
      level.removeAt(i);
    }
  }

  private markUnrealized({ node, hasUnrealizedChildren }: {
    node: Node;
    hasUnrealizedChildren: boolean;
  }) {
    const isAsWanted = node.hasUnrealizedChildren === hasUnrealizedChildren;
    if (!isAsWanted) {
      node.hasUnrealizedChildren = hasUnrealizedChildren;
    }
  }

  // The nodes under these keys are gone or about to be made again.
  private forget(keys: readonly string[]) {
    for (const key of keys) {
      const record = this.records.get(key);
      this.records.delete(key);
      this.forget(record?.childKeys ?? []);
    }
  }
}
