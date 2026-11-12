import {
  activateRenderer,
  activeRenderer,
  CommentNode,
  DomNode,
  ElementNode,
  FragmentNode,
  TextNode
} from "./dom.ts";
import type { ParentNode, TreeRenderer } from "./dom.ts";
import { createTreeRenderer } from "./tree.ts";
import type { Component } from "svelte";
import { mount } from "svelte";

// The `document` and the classes (`Node`, `Element`, `Text`, `Comment`,
// `DocumentFragment`) Svelte's client runtime reads from the global scope,
// over the tree. A component's static markup arrives from the compiler as an
// HTML string; it is parsed once into nodes of an inert renderer (no native
// object behind them), and each use clones them into the active one.

const TEMPLATE_TAG = "template";
const SELF_CLOSING_MARK = "/";
const ENTITIES = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", "\""],
  ["nbsp", "\u00A0"]
]);
const HEXADECIMAL = 16;
const DECIMAL = 10;
const entity = /&(?:#(x?)(\w+)|(\w+));/gu;
const token = /<!--(.*?)-->|<\/[^>]+>|<([^\s/>]+)((?:"[^"]*"|[^>"])*?)(\/?)>|([^<]+)/gsy;
const attribute = /([^\s=]+)(?:="([^"]*)")?/gu;

const inert = createTreeRenderer({
  create: () => null,
  setAttribute() {},
  removeAttribute() {},
  childrenChanged() {},
  fragmentChanged() {},
  removed() {},
  listen: () => null
});

function decodeEntities(text: string) {
  return text.replaceAll(entity, (match, hexadecimal?: string, code?: string, name?: string) => {
    const isNumeric = code !== undefined;
    return isNumeric ? String.fromCodePoint(Number.parseInt(code, hexadecimal ? HEXADECIMAL : DECIMAL)) : ENTITIES.get(name ?? "") ?? match;
  });
}

function parseTemplate(html: string) {
  const content = inert.createFragment();
  const open: Array<ParentNode<null>> = [content];
  token.lastIndex = 0;
  for (let match = token.exec(html); match !== null; match = token.exec(html)) {
    const [text, comment, tag, attributes = "", selfClosing] = match;
    const parent = open.at(-1) ?? content;
    const isClosing = text.startsWith("</");
    if (isClosing) {
      open.pop();
      continue;
    }

    const isElement = tag !== undefined;
    if (!isElement) {
      const isComment = comment !== undefined;
      inert.insert(parent, isComment ? inert.createComment(comment) : inert.createTextNode(decodeEntities(text)), null);
      continue;
    }

    const element = inert.createElement(tag);
    for (const [, name = "", value = ""] of attributes.matchAll(attribute)) {
      inert.setAttribute(element, name, decodeEntities(value));
    }

    inert.insert(parent, element, null);

    const isOpen = selfClosing !== SELF_CLOSING_MARK;
    if (isOpen) {
      open.push(element);
    }
  }

  return content;
}

/** The `<template>` Svelte parses a component's static markup in. */
class TemplateElement {
  content = inert.createFragment();

  set innerHTML(html: string) {
    this.content = parseTemplate(html);
  }
}

function createElement(name: string) {
  return name === TEMPLATE_TAG ? new TemplateElement() : activeRenderer().createElement(name);
}

function createDocument() {
  return {
    // What web-apis/page put on the global `document` stays reachable through the prototype.
    __proto__: globalThis.document ?? {
      addEventListener() {},
      removeEventListener() {}
    },
    createElement,
    createTextNode: (data: string) => activeRenderer().createTextNode(data),
    createComment: (data: string) => activeRenderer().createComment(data),
    createDocumentFragment: () => activeRenderer().createFragment(),
    importNode: (node: { cloneNode(isDeep: boolean): unknown }, isDeep: boolean) => node.cloneNode(isDeep)
  };
}

let isInstalled = false;

// What Svelte's client runtime reads from the global scope, installed before
// the first component mounts; once is enough.
function installDom() {
  if (isInstalled) {
    return;
  }

  isInstalled = true;
  const globals: Array<[string, object]> = [
    ["window", globalThis],
    ["document", createDocument()],
    // Svelte asks a custom element's class for its setters; there is none, so
    // every value goes to the attribute, as the tree expects.
    ["customElements", { get: () => class {} }],
    ["Node", DomNode],
    ["Element", ElementNode],
    ["Text", TextNode],
    ["Comment", CommentNode],
    ["DocumentFragment", FragmentNode],
    ["HTMLMediaElement", class {}]
  ];
  for (const [name, value] of globals) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true
    });
  }
}

/**
 * Mounts a component into a fragment of `renderer`'s tree, with the DOM shim
 * installed and `renderer` active.
 *
 * @param options - The component, its props, the renderer, the fragment to build in,
 *   and `intro`: whether global transitions play on this first render (Svelte's default: they do).
 * @returns What Svelte's `mount` returns: the component's exports.
 */
export function mountOnTree<Native, Props extends object>({
  component,
  props,
  renderer,
  target,
  intro: isIntro
}: {
  component: Component<Props>;
  props: Props;
  renderer: TreeRenderer<Native>;
  target: FragmentNode<Native>;
  intro?: boolean | undefined;
}) {
  installDom();
  activateRenderer(renderer);
  // The typings name the DOM's Element as a mount target; the shim's
  // fragment stands in for one.
  const mountTarget = target as unknown as Element;
  return mount(component, {
    target: mountTarget,
    props,
    ...isIntro !== undefined && {
      intro: isIntro
    }
  });
}
