import { parse } from "svelte/compiler";

/** A declaration found in the file, with the offsets of its text. */
export interface Located {
  property: string;
  value: string;
  /** Offsets in the file. */
  start: number;
  valueStart: number;
}

interface MarkupNode {
  type?: string;
  name?: string;
  start?: number;
  data?: string;
  value?: unknown;
  [key: string]: unknown;
}

const DECLARATION_SEPARATOR = ";";
const STYLE_MENTION = /\bstyle[:=]/u;

function isMarkupNode(value: unknown): value is MarkupNode {
  return typeof value === "object" && value !== null;
}

function textsOf(value: unknown) {
  const parts: unknown[] = Array.isArray(value) ? value : [];
  return parts.filter(isMarkupNode).filter(part => part.type === "Text" && part.start !== undefined && part.data !== undefined);
}

function childrenOf(node: MarkupNode) {
  return Object.values(node).flatMap(child => (Array.isArray(child) ? child : [child]));
}

// The `a: b; c: d` of a style attribute's text, each declaration with its offsets.
function attributeDeclarations({ text, base }: {
  text: string;
  base: number;
}) {
  const located: Located[] = [];
  let offset = base;
  for (const chunk of text.split(DECLARATION_SEPARATOR)) {
    const colon = chunk.indexOf(":");
    const hasDeclaration = colon > 0;
    if (hasDeclaration) {
      located.push({
        property: chunk.slice(0, colon).trim(),
        value: chunk.slice(colon + 1),
        start: offset,
        valueStart: offset + colon + 1
      });
    }

    offset += chunk.length + 1;
  }

  return located;
}

function declarationsOfNode(node: MarkupNode) {
  const isStyleAttribute = node.type === "Attribute" && node.name === "style";
  const isStyleDirective = node.type === "StyleDirective";
  return textsOf(node.value).flatMap(text => {
    const base = text.start ?? 0;
    if (isStyleDirective) {
      return [{
        property: node.name ?? "",
        value: text.data ?? "",
        start: node.start ?? base,
        valueStart: base
      }];
    }

    return isStyleAttribute ? attributeDeclarations({
      text: text.data ?? "",
      base
    }) : [];
  });
}

// Every node of the markup's tree, the root first; none when it does not parse.
function markupNodes(source: string) {
  let tree: unknown = null;
  try {
    tree = parse(source, { modern: true }).fragment;
  } catch {
    return [];
  }

  const nodes: MarkupNode[] = [];
  const pending: unknown[] = [tree];
  const seen = new Set<unknown>();
  for (const node of pending) {
    const isNew = isMarkupNode(node) && !seen.has(node);
    if (!isNew) {
      continue;
    }

    seen.add(node);
    nodes.push(node);
    pending.push(...childrenOf(node));
  }

  return nodes;
}

/** The declarations of every static `style="..."` attribute and `style:name` directive of the markup. */
export function markupDeclarations(source: string) {
  return markupNodes(source).flatMap(declarationsOfNode);
}

function propertiesOfNode(node: MarkupNode) {
  const isStyleDirective = node.type === "StyleDirective";
  if (isStyleDirective) {
    return [node.name ?? ""];
  }

  return declarationsOfNode(node).map(located => located.property);
}

/**
 * The properties the markup sets on elements: every `style:name` directive,
 * whatever its value (an expression included), and the declarations of every
 * static `style="..."` attribute. A `style={expression}` attribute names
 * none, which only the running app knows.
 */
export function markupStyleProperties(source: string) {
  const isStyled = STYLE_MENTION.test(source);
  if (!isStyled) {
    return [];
  }

  return [...new Set(markupNodes(source).flatMap(propertiesOfNode))];
}
