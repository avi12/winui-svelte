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
  /** Where the element starts and ends in the source. */
  start: number;
  end: number;
  /** The nodes written directly inside it. */
  childLevel: Level;
}

/** The nodes written next to each other in one place. */
export interface Level {
  items: Array<TemplateElement | null>;
  /** Whether the items are all there is: no block or component among them, and a known parent. */
  isStatic: boolean;
  /** Whether the elements and component instances among them are in a fixed order: what a sibling combinator needs. */
  isOrdered: boolean;
  /** Whether an `{#if}`, `{#each}`, `{#key}` or `{#await}` is among them: the number of elements depends on data. */
  hasBlock: boolean;
  /** Whether a component, a snippet render or other markup that is not an element is among them. */
  hasOpaque: boolean;
}

type TemplateNode = AST.Fragment["nodes"][number];

interface Walk {
  source: string;
  elements: TemplateElement[];
}

// A component instance is an element to a selector, as the stand-in the build gives Svelte's matcher.
const ELEMENT_TYPES: ReadonlySet<string> = new Set(["RegularElement", "Component", "SvelteComponent", "SvelteSelf"]);
const QUOTES: ReadonlySet<string> = new Set(["\"", "'"]);

type AttributeValue = AST.Attribute["value"];

function valueParts(value: AttributeValue) {
  const isFlag = value === true;
  if (isFlag) {
    return [];
  }

  return [value].flat();
}

type ElementLike = AST.RegularElement | AST.Component | AST.SvelteComponent | AST.SvelteSelf;

function classFacts({ element, source }: {
  element: ElementLike;
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
  node: ElementLike;
  parent: TemplateElement | null;
  level: Level;
}) {
  const childLevel: Level = {
    items: [],
    isStatic: true,
    isOrdered: true,
    hasBlock: false,
    hasOpaque: false
  };
  const element: TemplateElement = {
    name: node.name.toLowerCase(),
    ...classFacts({
      element: node,
      source: walk.source
    }),
    nameEnd: node.start + 1 + node.name.length,
    parent,
    level,
    start: node.start,
    end: node.end,
    childLevel
  };
  level.items.push(element);
  walk.elements.push(element);
  const isInstance = node.type !== "RegularElement";
  if (isInstance) {
    level.isStatic = false;
    level.hasOpaque = true;
  }

  addNodes({
    walk,
    nodes: node.fragment.nodes,
    parent: element,
    level: childLevel
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

function addNodes({ walk, nodes, parent, level }: {
  walk: Walk;
  nodes: readonly TemplateNode[];
  parent: TemplateElement | null;
  level: Level;
}) {
  for (const node of nodes) {
    const isElement = ELEMENT_TYPES.has(node.type);
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
    level.isOrdered = false;
    level.hasBlock ||= isBlock;
    level.hasOpaque ||= !isBlock;
    for (const fragment of isBlock ? fragments : []) {
      addNodes({
        walk,
        nodes: fragment?.nodes ?? [],
        parent,
        level: {
          items: [],
          isStatic: false,
          isOrdered: false,
          hasBlock: false,
          hasOpaque: false
        }
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
    level: {
      items: [],
      isStatic: false,
      isOrdered: false,
      hasBlock: false,
      hasOpaque: false
    }
  });
  return walk.elements;
}
