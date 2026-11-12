import { specOf } from "./menu-node.ts";
import { ElementNode, NodeType } from "#src/renderer/tree/dom.js";
import { MenuItemKind } from "#src/tray/menu/types.js";
import type { MenuItem } from "#src/tray/menu/types.js";

function itemsUnder<Native>(parent: ElementNode<Native>): MenuItem[] {
  const items: MenuItem[] = [];
  for (const child of parent.children) {
    const isElement = child.type === NodeType.ELEMENT;
    if (!isElement) {
      continue;
    }

    const spec = specOf(child);
    const isUnknown = spec === undefined;
    if (isUnknown) {
      continue;
    }

    const isSubmenu = spec.kind === MenuItemKind.SUBMENU;
    if (isSubmenu) {
      items.push({
        ...spec,
        items: itemsUnder(child)
      });
    } else {
      items.push(spec);
    }
  }

  return items;
}

/**
 * Reads the menu that `TrayMenu` markup declares out of the tree, in the order
 * it is written, with each `{#each}` expanded and each submenu holding the
 * lines inside it. Call it each time the menu opens: the specs are always the
 * latest props.
 *
 * Markup cannot carry a literal union, so the ids are plain strings.
 *
 * @param root - The element of a `TrayMenu`.
 * @returns The declared lines, for `resolveMenu`.
 */
export function collectMenu<Native>(root: ElementNode<Native>) {
  return itemsUnder(root);
}

/**
 * Whether an object is an element of the tree, to narrow what an attachment is given.
 *
 * @param node - Any object.
 * @returns True for an element of the tree.
 */
export function isElementNode(node: object): node is ElementNode<unknown> {
  return node instanceof ElementNode;
}
