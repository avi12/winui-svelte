import type { AST } from "svelte/compiler";

/**
 * A component's markup as the selectors of its `<style>` see it: the elements
 * it writes itself, each with the facts a relational selector asks about. What
 * is not known at build time (a component's own root, an `{#if}`, an `{#each}`,
 * a snippet render) is a level that is not `isStatic`: an element in it, or next
 * to something in it, has no fixed position among its siblings.
 */
export interface TemplateElement {
  name: string;
  /** The classes the markup writes, in `class="..."`. */
  classes: readonly string[];
  /** Whether the class is also set by an expression, a `class:` directive or a spread: what it has cannot be told. */
  hasDynamicClass: boolean;
  /** Where the opening tag's name ends in the source: a class goes here when there is no class attribute. */
  nameEnd: number;
  /** Where a class can be appended inside a static `class="..."`, or null when there is none to append to. */
  classEnd: number | null;
  parent: TemplateElement | null;
  level: Level;
}

/** The nodes written next to each other in one place. */
export interface Level {
  items: Array<TemplateElement | null>;
  /** Whether the items are all there is: no block or component among them, and a known parent. */
  isStatic: boolean;
}

type TemplateNode = AST.Fragment["nodes"][number];

interface Walk {
  source: string;
  elements: TemplateElement[];
}

const QUOTES: ReadonlySet<string> = new Set(["\"", "'"]);

type AttributeValue = AST.Attribute["value"];

function valueParts(value: AttributeValue) {
  const isFlag = value === true;
  if (isFlag) {
    return [];
  }

  return [value].flat();
}

function classFacts({ element, source }: {
  element: AST.RegularElement;
  source: string;
}) {
  const classes: string[] = [];
  let hasDynamicClass = false;
  let classEnd: number | null = null;
  for (const attribute of element.attributes) {
    const isSpread = attribute.type === "SpreadAttribute";
    const isDirective = attribute.type === "ClassDirective";
    const isClassAttribute = attribute.type === "Attribute" && attribute.name === "class";

    hasDynamicClass ||= isSpread || isDirective;

    if (!isClassAttribute) {
      continue;
    }

    const parts = valueParts(attribute.value);
    for (const part of parts) {
      const isText = part.type === "Text";
      if (isText) {
        classes.push(...part.data.split(/\s+/u).filter(name => name !== ""));
      } else {
        hasDynamicClass = true;
      }
    }

    const isQuoted = QUOTES.has(source.charAt(attribute.end - 1));
    const hasValue = parts.length > 0;
    const canAppend = isQuoted && hasValue;
    classEnd = canAppend ? attribute.end - 1 : null;
    hasDynamicClass ||= !isQuoted;
  }

  return {
    classes,
    hasDynamicClass,
    classEnd
  };
}

function addElement({ walk, node, parent, level }: {
  walk: Walk;
  node: AST.RegularElement;
  parent: TemplateElement | null;
  level: Level;
}) {
  const element: TemplateElement = {
    name: node.name.toLowerCase(),
    ...classFacts({
      element: node,
      source: walk.source
    }),
    nameEnd: node.start + 1 + node.name.length,
    parent,
    level
  };
  level.items.push(element);
  walk.elements.push(element);
  addNodes({
    walk,
    nodes: node.fragment.nodes,
    parent: element,
    isStatic: true
  });
}

// The fragments of a block, each a level of its own: what is in them depends on the data.
function blockFragments(node: TemplateNode) {
  switch (node.type) {
    case "IfBlock":
      return [node.consequent, node.alternate ?? null];
    case "EachBlock":
      return [node.body, node.fallback ?? null];
    case "KeyBlock":
      return [node.fragment];
    case "AwaitBlock":
      return [node.pending, node.then, node.catch];
    default:
      return null;
  }
}

function addNodes({ walk, nodes, parent, isStatic }: {
  walk: Walk;
  nodes: readonly TemplateNode[];
  parent: TemplateElement | null;
  isStatic: boolean;
}) {
  const level: Level = {
    items: [],
    isStatic: isStatic && parent !== null
  };
  for (const node of nodes) {
    const isElement = node.type === "RegularElement";
    if (isElement) {
      addElement({
        walk,
        node,
        parent,
        level
      });
      continue;
    }

    const fragments = blockFragments(node);
    const isBlock = fragments !== null;
    const isMarkup = node.type === "Text" || node.type === "Comment" || node.type === "ConstTag";
    if (isMarkup) {
      continue;
    }

    level.items.push(null);
    level.isStatic = false;
    for (const fragment of isBlock ? fragments : []) {
      addNodes({
        walk,
        nodes: fragment?.nodes ?? [],
        parent,
        isStatic: false
      });
    }
  }
}

/** Every element a component's markup writes, in document order. */
export function templateElements({ root, source }: {
  root: AST.Root;
  source: string;
}) {
  const walk: Walk = {
    source,
    elements: []
  };
  addNodes({
    walk,
    nodes: root.fragment.nodes,
    parent: null,
    isStatic: false
  });
  return walk.elements;
}
