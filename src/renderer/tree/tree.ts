import type { NativeValue } from "#src/native-value.js";
import { createRenderer } from "svelte/renderer";

// The tree of nodes a Svelte custom renderer keeps, with no platform in it:
// elements, text, the comments Svelte anchors its {#if} and {#each} blocks
// on, and the fragments it builds them in. Each element carries the native
// object it stands for; the host is told when an element's children change,
// so it can bring the native children in line.

/** The kinds of node the tree holds. */
export const NodeType = {
  FRAGMENT: "fragment",
  ELEMENT: "element",
  TEXT: "text",
  COMMENT: "comment"
} as const;

/** An element: a tag, the native object it stands for, and its attributes and children. */
export interface ElementNode<Native> {
  type: typeof NodeType.ELEMENT;
  name: string;
  native: Native;
  attributes: Map<string, NativeValue>;
  children: Array<TreeNode<Native>>;
  parent: ParentNode<Native> | null;
  // By event type, then by handler: what ends each subscription.
  listeners: Map<string, Map<NativeValue, () => void>>;
}

/** The root Svelte builds a block in before inserting it, or mounts a component on. */
export interface FragmentNode<Native> {
  type: typeof NodeType.FRAGMENT;
  children: Array<TreeNode<Native>>;
  parent: null;
}

/** A run of text. */
export interface TextNode<Native> {
  type: typeof NodeType.TEXT;
  value: string;
  parent: ParentNode<Native> | null;
}

/** The comment Svelte anchors an `{#if}` or `{#each}` block on. */
export interface CommentNode<Native> {
  type: typeof NodeType.COMMENT;
  value: string;
  parent: ParentNode<Native> | null;
}

/** A node that has children. */
export type ParentNode<Native> = ElementNode<Native> | FragmentNode<Native>;

/** A node that can sit in a parent's children. */
export type TreeNode<Native> = ElementNode<Native> | TextNode<Native> | CommentNode<Native>;

type AnyNode<Native> = TreeNode<Native> | FragmentNode<Native>;

/** What the tree asks of the platform its elements stand for. */
export interface NativeHost<Native> {
  create(name: string): Native;
  setAttribute(element: ElementNode<Native>, name: string, value: NativeValue): void;
  removeAttribute(element: ElementNode<Native>, name: string): void;
  childrenChanged(element: ElementNode<Native>): void;
  // A fragment's children changed: a mount target's, when a hot update
  // replaces a component's nodes.
  fragmentChanged(fragment: FragmentNode<Native>): void;
  // A subtree Svelte has removed and will not insert again.
  removed(node: TreeNode<Native>): void;
  // What ends the subscription, or null when nothing was subscribed.
  listen(element: ElementNode<Native>, type: string, handler: NativeValue): (() => void) | null;
}

/**
 * The element a node sits in.
 *
 * @param node - Any node in the tree.
 * @returns Its parent when that is an element, or `null` for a node in a fragment or a loose one.
 */
export function parentElement<Native>(node: TreeNode<Native>) {
  return node.parent?.type === NodeType.ELEMENT ? node.parent : null;
}

function notify<Native>({ host, parent }: {
  host: NativeHost<Native>;
  parent: ParentNode<Native> | null;
}) {
  if (!parent) {
    return;
  }

  const isElement = parent.type === NodeType.ELEMENT;
  if (isElement) {
    host.childrenChanged(parent);
  } else {
    host.fragmentChanged(parent);
  }
}

// Takes a node out of its parent's children, leaving the host untold.
function unlink<Native>(node: TreeNode<Native>) {
  const parent = node.parent;
  if (!parent) {
    return null;
  }

  parent.children.splice(parent.children.indexOf(node), 1);
  node.parent = null;
  return parent;
}

// Puts an unlinked node before the anchor, or last when there is none.
function link<Native>({ parent, node, anchor }: {
  parent: ParentNode<Native>;
  node: TreeNode<Native>;
  anchor: TreeNode<Native> | null;
}) {
  const position = anchor === null ? -1 : parent.children.indexOf(anchor);
  const isAnchorFound = position >= 0;
  if (isAnchorFound) {
    parent.children.splice(position, 0, node);
  } else {
    parent.children.push(node);
  }

  node.parent = parent;
}

function removeNode<Native>({ host, node }: {
  host: NativeHost<Native>;
  node: TreeNode<Native>;
}) {
  notify({
    host,
    parent: unlink(node)
  });
}

// Inserting a fragment moves all its children; the parent hears of it once.
function insertFragment<Native>({ host, parent, fragment, anchor }: {
  host: NativeHost<Native>;
  parent: ParentNode<Native>;
  fragment: FragmentNode<Native>;
  anchor: TreeNode<Native> | null;
}) {
  for (const child of fragment.children.splice(0)) {
    child.parent = null;
    link({
      parent,
      node: child,
      anchor
    });
  }

  notify({
    host,
    parent
  });
}

// A node already in the tree is moved: a keyed {#each} reorders this way. A
// move within one parent tells the host once, after the move.
function insertNode<Native>({ host, parent, node, anchor }: {
  host: NativeHost<Native>;
  parent: ParentNode<Native>;
  node: AnyNode<Native>;
  anchor: TreeNode<Native> | null;
}) {
  const isFragment = node.type === NodeType.FRAGMENT;
  if (isFragment) {
    insertFragment({
      host,
      parent,
      fragment: node,
      anchor
    });
    return;
  }

  const isAnchoredOnItself = node === anchor;
  if (isAnchoredOnItself) {
    return;
  }

  const previousParent = unlink(node);
  link({
    parent,
    node,
    anchor
  });

  const hasChangedParent = previousParent !== parent;
  if (hasChangedParent) {
    notify({
      host,
      parent: previousParent
    });
  }

  notify({
    host,
    parent
  });
}

/**
 * The node after a node in its parent's children.
 *
 * @param node - Any node in the tree.
 * @returns The next sibling, or `null` for the last child or a loose node.
 */
export function nextSibling<Native>(node: TreeNode<Native>) {
  const siblings = node.parent?.children ?? [];
  return siblings[siblings.indexOf(node) + 1] ?? null;
}

// An element's text replaces all its children with one text node.
function setElementText<Native>({ host, element, text }: {
  host: NativeHost<Native>;
  element: ElementNode<Native>;
  text: string;
}) {
  for (const child of element.children.splice(0)) {
    child.parent = null;
  }

  link({
    parent: element,
    node: createText<Native>(text),
    anchor: null
  });
  notify({
    host,
    parent: element
  });
}

function createText<Native>(value: string) {
  return {
    type: NodeType.TEXT,
    value,
    parent: null
  } satisfies TextNode<Native>;
}

function listenersOf<Native>({ element, type }: {
  element: ElementNode<Native>;
  type: string;
}) {
  const existing = element.listeners.get(type);
  if (existing) {
    return existing;
  }

  const created = new Map<NativeValue, () => void>();
  element.listeners.set(type, created);
  return created;
}

/**
 * Builds the Svelte renderer for a platform, over a tree that tells the
 * platform what changed. A component compiled with `customRenderer` draws
 * through it.
 *
 * @param host - The platform's side: making elements and applying attributes, and hearing of changes.
 * @returns The renderer Svelte's `mount` takes.
 */
export function createTreeRenderer<Native>(host: NativeHost<Native>) {
  return createRenderer<{
    fragment: FragmentNode<Native>;
    element: ElementNode<Native>;
    text: TextNode<Native>;
    comment: CommentNode<Native>;
  }>({
    createFragment() {
      return {
        type: NodeType.FRAGMENT,
        children: [],
        parent: null
      };
    },
    createElement(name) {
      return {
        type: NodeType.ELEMENT,
        name,
        native: host.create(name),
        attributes: new Map(),
        children: [],
        parent: null,
        listeners: new Map()
      };
    },
    createTextNode(data) {
      return createText(data);
    },
    createComment(data) {
      return {
        type: NodeType.COMMENT,
        value: data,
        parent: null
      };
    },
    nodeType(node) {
      return node.type;
    },
    getNodeValue(node) {
      return node.value;
    },
    getAttribute(element, name) {
      const value = element.attributes.get(name);
      return value === undefined ? null : String(value);
    },
    setAttribute(element, key, value) {
      element.attributes.set(key, value);
      host.setAttribute(element, key, value);
    },
    removeAttribute(element, name) {
      element.attributes.delete(name);
      host.removeAttribute(element, name);
    },
    hasAttribute(element, name) {
      return element.attributes.has(name);
    },
    setText(node, text) {
      const isElement = node.type === NodeType.ELEMENT;
      if (isElement) {
        setElementText({
          host,
          element: node,
          text
        });
        return;
      }

      node.value = text;
      notify({
        host,
        parent: node.parent
      });
    },
    getFirstChild(element) {
      return element.children[0] ?? null;
    },
    getLastChild(element) {
      return element.children.at(-1) ?? null;
    },
    getNextSibling(node) {
      return nextSibling(node);
    },
    insert(parent, node, anchor) {
      insertNode({
        host,
        parent,
        node,
        anchor
      });
    },
    remove(node) {
      removeNode({
        host,
        node
      });
      host.removed(node);
    },
    getParent(node) {
      return node.parent;
    },
    addEventListener(target, type, handler) {
      const unsubscribe = host.listen(target, type, handler);
      if (unsubscribe) {
        listenersOf({
          element: target,
          type
        }).set(handler, unsubscribe);
      }
    },
    removeEventListener(target, type, handler) {
      const listeners = target.listeners.get(type);
      listeners?.get(handler)?.();
      listeners?.delete(handler);
    }
  });
}
