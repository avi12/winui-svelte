import type { NativeValue } from "#src/native-value.js";

// The tree's nodes, shaped like the DOM nodes Svelte's own client runtime
// talks to, so a component compiled for the browser by a stock Svelte draws
// into the tree: `document.createElement`, `insertBefore`, `setAttribute` and
// the rest are the tree's operations (tree.ts) under the DOM's names. Svelte
// finds this DOM through the globals `installDom` (document.ts) defines. Only
// what Svelte's runtime calls is here.

/** The kinds of node the tree holds. */
export const NodeType = {
  FRAGMENT: "fragment",
  ELEMENT: "element",
  TEXT: "text",
  COMMENT: "comment"
} as const;

const NODE_NUMBERS = {
  [NodeType.ELEMENT]: 1,
  [NodeType.TEXT]: 3,
  [NodeType.COMMENT]: 8,
  [NodeType.FRAGMENT]: 11
};
const CLASS_ATTRIBUTE = "class";
const STYLE_ATTRIBUTE = "style";
// Not the HTML namespace, so Svelte keeps an attribute's case and sets
// `class` as an attribute, as for any element that is not HTML.
const WINUI_NAMESPACE = "winui";
const CLASS_SEPARATOR = /\s+/u;

/** A node that has children. */
export type ParentNode<Native> = ElementNode<Native> | FragmentNode<Native>;

/** A node that can sit in a parent's children. */
export type TreeNode<Native> = ElementNode<Native> | TextNode<Native> | CommentNode<Native>;

type AnyNode<Native> = TreeNode<Native> | FragmentNode<Native>;

/** What the DOM shim asks of the tree, which `createTreeRenderer` builds. */
export interface TreeRenderer<Native> {
  createFragment(): FragmentNode<Native>;
  createElement(name: string): ElementNode<Native>;
  createTextNode(data: string): TextNode<Native>;
  createComment(data: string): CommentNode<Native>;
  setAttribute(element: ElementNode<Native>, name: string, value: NativeValue): void;
  removeAttribute(element: ElementNode<Native>, name: string): void;
  setText(node: TextNode<Native> | CommentNode<Native>, text: string): void;
  insert(parent: ParentNode<Native>, node: AnyNode<Native>, anchor: TreeNode<Native> | null): void;
  remove(node: TreeNode<Native>): void;
  clear(parent: ParentNode<Native>): void;
  addEventListener(target: ElementNode<Native>, type: string, handler: NativeValue): void;
  removeEventListener(target: ElementNode<Native>, type: string, handler: NativeValue): void;
}

// The renderer a clone is made in: the one document the page has. A
// template's nodes belong to an inert renderer.
let documentRenderer: TreeRenderer<unknown> | null = null;

/**
 * Makes `renderer` the one Svelte's `document` builds nodes in, and clones
 * nodes into. Nodes already built keep the renderer they were built by.
 *
 * @param renderer - The renderer of the platform the components draw on.
 */
export function activateRenderer<Native>(renderer: TreeRenderer<Native>) {
  documentRenderer = renderer;
}

/**
 * The renderer `activateRenderer` last made active.
 *
 * @returns The active renderer.
 * @throws {Error} When none is active.
 */
export function activeRenderer() {
  if (!documentRenderer) {
    throw new Error("no renderer is active");
  }

  return documentRenderer;
}

/** The DOM's `Node`: what every node of the tree is. */
export abstract class DomNode<Native> {
  abstract readonly type: AnyNode<Native>["type"];
  parent: ParentNode<Native> | null = null;
  // Text and comments have none; Svelte reads `firstChild` of any node.
  readonly children: Array<TreeNode<Native>> = [];
  readonly renderer: TreeRenderer<Native>;

  protected constructor(renderer: TreeRenderer<Native>) {
    this.renderer = renderer;
  }

  get nodeType() {
    return NODE_NUMBERS[this.type];
  }

  get parentNode() {
    return this.parent;
  }

  get firstChild() {
    return this.children[0] ?? null;
  }

  get lastChild() {
    return this.children.at(-1) ?? null;
  }

  get nextSibling() {
    const siblings: readonly object[] = this.parent?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  abstract cloneNode(isDeep?: boolean): AnyNode<unknown>;

  remove(this: TreeNode<Native>) {
    this.renderer.remove(this);
  }

  before(this: TreeNode<Native>, ...nodes: Array<AnyNode<Native>>) {
    const { parent } = this;
    if (!parent) {
      return;
    }

    for (const node of nodes) {
      this.renderer.insert(parent, node, this);
    }
  }

  // A clone belongs to the document, whoever made the node cloned.
  protected cloneChildrenInto(parent: ParentNode<unknown>) {
    for (const child of this.children) {
      activeRenderer().insert(parent, child.cloneNode(true), null);
    }
  }
}

/** What an element and a fragment share: they hold children. */
abstract class DomParent<Native> extends DomNode<Native> {
  appendChild(this: ParentNode<Native>, child: AnyNode<Native>) {
    this.renderer.insert(this, child, null);
    return child;
  }

  append(this: ParentNode<Native>, ...nodes: Array<AnyNode<Native>>) {
    for (const node of nodes) {
      this.renderer.insert(this, node, null);
    }
  }

  insertBefore(this: ParentNode<Native>, child: AnyNode<Native>, anchor: TreeNode<Native> | null) {
    this.renderer.insert(this, child, anchor);
    return child;
  }

  removeChild(this: ParentNode<Native>, child: TreeNode<Native>) {
    this.renderer.remove(child);
    return child;
  }

  get textContent() {
    return "";
  }

  // Only `= ""` (emptying an element) is asked of it.
  set textContent(text: string) {
    const parent = this.asParent();
    this.renderer.clear(parent);

    if (text) {
      this.renderer.insert(parent, this.renderer.createTextNode(text), null);
    }
  }

  // An element and a fragment are the only classes of this one.
  private asParent() {
    return this as unknown as ParentNode<Native>;
  }
}

/** The root Svelte builds a block in before inserting it, or mounts a component on: the DOM's `DocumentFragment`. */
export class FragmentNode<Native> extends DomParent<Native> {
  override readonly type = NodeType.FRAGMENT;
  override parent = null;

  constructor(renderer: TreeRenderer<Native>) {
    super(renderer);
  }

  override cloneNode(isDeep = false) {
    const clone = activeRenderer().createFragment();
    if (isDeep) {
      this.cloneChildrenInto(clone);
    }

    return clone;
  }
}

/** What a text node and a comment share. */
abstract class DomCharacterData<Native> extends DomNode<Native> {
  value: string;

  constructor(renderer: TreeRenderer<Native>, value: string) {
    super(renderer);
    this.value = value;
  }

  get data() {
    return this.value;
  }

  set data(text: string) {
    // A text node and a comment are the only classes of this one.
    this.renderer.setText(this as unknown as TextNode<Native> | CommentNode<Native>, text);
  }

  get nodeValue() {
    return this.value;
  }

  set nodeValue(text: string) {
    this.data = text;
  }
}

/** A run of text: the DOM's `Text`. */
export class TextNode<Native> extends DomCharacterData<Native> {
  override readonly type = NodeType.TEXT;

  override cloneNode() {
    return activeRenderer().createTextNode(this.value);
  }
}

/** The comment Svelte anchors an `{#if}` or `{#each}` block on: the DOM's `Comment`. */
export class CommentNode<Native> extends DomCharacterData<Native> {
  override readonly type = NodeType.COMMENT;

  override cloneNode() {
    return activeRenderer().createComment(this.value);
  }
}

const declaration = /^([^:]+):(.*)$/u;

function declarationsOf(text: NativeValue) {
  return String(text ?? "").split(";").flatMap(part => {
    const match = declaration.exec(part);
    return match ? [[(match[1] ?? "").trim(), (match[2] ?? "").trim()]] : [];
  });
}

/** An element: a tag, the native object it stands for, and its attributes and children; the DOM's `Element`. */
export class ElementNode<Native> extends DomParent<Native> {
  override readonly type = NodeType.ELEMENT;
  readonly namespaceURI = WINUI_NAMESPACE;
  readonly attributes = new Map<string, NativeValue>();
  // By event type, then by handler: what ends each subscription.
  readonly listeners = new Map<string, Map<NativeValue, () => void>>();
  readonly name: string;
  readonly native: Native;

  constructor(renderer: TreeRenderer<Native>, name: string, native: Native) {
    super(renderer);
    this.name = name;
    this.native = native;
  }

  // A compiled component sets a slider's value by assigning the DOM property;
  // here it is an attribute, like any other.
  get value() {
    return this.attributes.get("value");
  }

  set value(value: NativeValue) {
    this.setAttribute("value", value);
  }

  get nodeName() {
    return this.name.toUpperCase();
  }

  get className() {
    return String(this.attributes.get(CLASS_ATTRIBUTE) ?? "");
  }

  set className(value: string) {
    this.setAttribute(CLASS_ATTRIBUTE, value);
  }

  get classList() {
    return {
      toggle: (name: string, isForced?: boolean) => {
        const names = new Set(this.className.split(CLASS_SEPARATOR));
        const isPresent = isForced ?? !names.has(name);
        names[isPresent ? "add" : "delete"](name);
        this.className = [...names].join(" ").trim();
        return isPresent;
      }
    };
  }

  get style() {
    const write = (declarations: string[][]) => {
      this.setAttribute(STYLE_ATTRIBUTE, declarations.map(([name, value]) => `${name}: ${value}`).join("; "));
    };
    const current = () => declarationsOf(this.attributes.get(STYLE_ATTRIBUTE));
    function others(name: string) {
      return current().filter(([key]) => key !== name);
    }

    return {
      set cssText(text: string) {
        write(declarationsOf(text));
      },
      setProperty: (name: string, value: string) => write([...others(name), [name, value]]),
      removeProperty: (name: string) => write(others(name))
    };
  }

  getAttribute(name: string) {
    const value = this.attributes.get(name);
    return value === undefined ? null : String(value);
  }

  hasAttribute(name: string) {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: NativeValue) {
    this.renderer.setAttribute(this, name, value);
  }

  removeAttribute(name: string) {
    this.renderer.removeAttribute(this, name);
  }

  addEventListener(type?: string, handler?: NativeValue) {
    const isTyped = type !== undefined;
    if (isTyped) {
      this.renderer.addEventListener(this, type, handler);
    }
  }

  removeEventListener(type?: string, handler?: NativeValue) {
    const isTyped = type !== undefined;
    if (isTyped) {
      this.renderer.removeEventListener(this, type, handler);
    }
  }

  focus() {}

  override cloneNode(isDeep = false) {
    const renderer = activeRenderer();
    const clone = renderer.createElement(this.name);
    for (const [name, value] of this.attributes) {
      renderer.setAttribute(clone, name, value);
    }

    if (isDeep) {
      this.cloneChildrenInto(clone);
    }

    return clone;
  }
}
