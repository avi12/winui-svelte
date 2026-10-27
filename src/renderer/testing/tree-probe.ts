import type { ElementNode, FragmentNode, NativeHost, TreeNode } from "#src/renderer/tree/tree.js";
import { createTreeRenderer, NodeType } from "#src/renderer/tree/tree.js";

// A host with no platform behind it, for the tests: each element counts how
// often its children changed and how many events it listens to; its
// attributes are kept by the tree.

interface ProbeNative {
  childChanges: number;
  subscriptions: number;
}

export type ProbeElement = ElementNode<ProbeNative>;

const probeHost: NativeHost<ProbeNative> = {
  create() {
    return {
      childChanges: 0,
      subscriptions: 0
    };
  },
  setAttribute() {},
  removeAttribute() {},
  removed() {},
  fragmentChanged() {},
  childrenChanged(element) {
    element.native.childChanges++;
  },
  listen(element) {
    element.native.subscriptions++;
    return () => {
      element.native.subscriptions--;
    };
  }
};

const probeRenderer = createTreeRenderer(probeHost);

// The tree as text: an element as name(children), text in quotes, a comment
// as #. Fragments show their children.
export function outline(node: TreeNode<ProbeNative> | FragmentNode<ProbeNative>) {
  const isText = node.type === NodeType.TEXT;
  if (isText) {
    return `"${node.value}"`;
  }

  const isComment = node.type === NodeType.COMMENT;
  if (isComment) {
    return "#";
  }

  const outlines: string[] = [];
  for (const child of node.children) {
    outlines.push(outline(child));
  }

  const children = outlines.join(" ");
  return node.type === NodeType.ELEMENT ? `${node.name}(${children})` : children;
}

// Svelte's customRenderer option imports the renderer module's default export.
// eslint-disable-next-line no-restricted-exports -- Svelte requires the default export
export default probeRenderer;
