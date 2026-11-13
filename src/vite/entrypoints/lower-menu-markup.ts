import { spanOf } from "./node-span.ts";
import { TraySvelteError } from "./tray-svelte-error.ts";
import type { AST } from "svelte/compiler";

/** The components of `winui-svelte/tray/menu/svelte` that a `tray.svelte` menu is written with. */
export const MenuComponent = {
  MENU: "TrayMenu",
  ITEM: "TrayMenuItem",
  SUBMENU: "TrayMenuSubmenu",
  SEPARATOR: "TrayMenuSeparator",
  HEADER: "TrayMenuHeader"
} as const;
/** One of `MenuComponent`'s values. */
export type MenuComponent = typeof MenuComponent[keyof typeof MenuComponent];

const COMPONENT_NAMES: ReadonlySet<string> = new Set(Object.values(MenuComponent));

/**
 * Whether a name is one of the menu components.
 *
 * @param name - An exported name of `winui-svelte/tray/menu/svelte`.
 * @returns True for a component a tray.svelte may use.
 */
export function isMenuComponent(name: string): name is MenuComponent {
  return COMPONENT_NAMES.has(name);
}

/** What lowering a menu needs to know. */
export interface MarkupContext {
  readonly source: string;
  readonly file: string;

  /** The menu component each imported local name stands for. */
  readonly components: ReadonlyMap<string, MenuComponent>;

  /** The identifier the generated code reaches `MenuItemKind` by. */
  readonly kindName: string;
}

type FragmentNode = AST.Fragment["nodes"][number];

const KIND_MEMBERS = new Map([
  ["command", "COMMAND"],
  ["check", "CHECK"],
  ["radio", "RADIO"]
]);
const FIXED_KINDS = {
  [MenuComponent.SUBMENU]: "SUBMENU",
  [MenuComponent.SEPARATOR]: "SEPARATOR",
  [MenuComponent.HEADER]: "HEADER"
} as const;
const PLAIN_KEY = /^[A-Za-z_$][\w$]*$/u;
const TEMPLATE_ESCAPE = /[\\`]|\$\{/gu;
const SIMPLE_LISTS = new Set(["Identifier", "MemberExpression", "CallExpression"]);
const EACH_FALLBACK_PARAMETER = "_item";

const NODE_CONSTRUCTS = new Map([
  ["AwaitBlock", ["{#await}", "the menu is read when it opens and cannot wait; resolve the data in the script and loop over the result"]],
  ["KeyBlock", ["{#key}", "there is nothing to re-create, the menu is built again each time it opens"]],
  ["SnippetBlock", ["{#snippet}", "write the lines in place, or loop with {#each}"]],
  ["RenderTag", ["{@render}", "write the lines in place, or loop with {#each}"]],
  ["HtmlTag", ["{@html}", "a menu has no HTML"]],
  ["DebugTag", ["{@debug}", "use console.log in a function"]],
  ["ExpressionTag", ["an {expression} between lines", "write a line as a menu component"]]
]);
const DIRECTIVE_CONSTRUCTS = new Map([
  ["BindDirective", "bind:"],
  ["UseDirective", "use:"],
  ["OnDirective", "on:"],
  ["ClassDirective", "class:"],
  ["StyleDirective", "style:"],
  ["LetDirective", "let:"],
  ["TransitionDirective", "a transition"],
  ["AnimateDirective", "animate:"],
  ["AttachTag", "{@attach}"]
]);

function errorAt({ context, offset, construct, reason }: {
  context: MarkupContext;
  offset: number;
  construct: string;
  reason: string;
}) {
  return new TraySvelteError({
    file: context.file,
    source: context.source,
    offset,
    construct,
    reason
  });
}

function textOf({ context, node }: {
  context: MarkupContext;
  node: { readonly type: string };
}) {
  const { start, end } = spanOf(node);
  const text = context.source.slice(start, end);
  return node.type === "SequenceExpression" ? `(${text})` : text;
}

function templateOf({ context, parts }: {
  context: MarkupContext;
  parts: readonly (AST.Text | AST.ExpressionTag)[];
}) {
  const [only] = parts;
  const isPlainText = parts.length === 1 && only?.type === "Text";
  if (isPlainText) {
    return JSON.stringify(only.data);
  }

  const inner = parts.map(part => {
    const isText = part.type === "Text";
    if (isText) {
      return part.data.replaceAll(TEMPLATE_ESCAPE, match => `\\${match}`);
    }

    return `\${${textOf({
      context,
      node: part.expression
    })}}`;
  });
  return `\`${inner.join("")}\``;
}

function valueOf({ context, attribute }: {
  context: MarkupContext;
  attribute: AST.Attribute;
}) {
  const { value } = attribute;
  const isFlag = value === true;
  if (isFlag) {
    return "true";
  }

  if (Array.isArray(value)) {
    return templateOf({
      context,
      parts: value
    });
  }

  return textOf({
    context,
    node: value.expression
  });
}

function keyOf(name: string) {
  return PLAIN_KEY.test(name) ? name : JSON.stringify(name);
}

function kindOf({ context, attribute }: {
  context: MarkupContext;
  attribute: AST.Attribute;
}) {
  const { value } = attribute;
  const [only] = Array.isArray(value) ? value : [];
  const isLiteral = Array.isArray(value) && value.length === 1 && only?.type === "Text";
  if (!isLiteral) {
    return valueOf({
      context,
      attribute
    });
  }

  const member = KIND_MEMBERS.get(only.data);
  const isUnknownKind = member === undefined;
  if (isUnknownKind) {
    throw errorAt({
      context,
      offset: attribute.start,
      construct: `kind="${only.data}"`,
      reason: "a TrayMenuItem is a command, a check or a radio; use TrayMenuSubmenu, TrayMenuSeparator or TrayMenuHeader for the others"
    });
  }

  return `${context.kindName}.${member}`;
}

function isKindAttribute(attribute: AST.Component["attributes"][number]): attribute is AST.Attribute {
  return attribute.type === "Attribute" && attribute.name === "kind";
}

function propertiesOf({ context, component, node }: {
  context: MarkupContext;
  component: Exclude<MenuComponent, typeof MenuComponent.MENU>;
  node: AST.Component;
}) {
  const properties: string[] = [];
  for (const attribute of node.attributes) {
    const directive = DIRECTIVE_CONSTRUCTS.get(attribute.type);
    const isDirective = directive !== undefined;
    if (isDirective) {
      throw errorAt({
        context,
        offset: attribute.start,
        construct: directive,
        reason: "a tray menu has no DOM and no reactivity, only plain values and functions; pass a value or a function as an attribute"
      });
    }

    const isSpread = attribute.type === "SpreadAttribute";
    if (isSpread) {
      properties.push(
        `...${textOf({
          context,
          node: attribute.expression
        })}`
      );
      continue;
    }

    const isOtherNode = attribute.type !== "Attribute";
    if (isOtherNode) {
      throw errorAt({
        context,
        offset: attribute.start,
        construct: attribute.type,
        reason: "only attributes are read"
      });
    }

    const isItemKind = component === MenuComponent.ITEM && attribute.name === "kind";
    if (!isItemKind) {
      properties.push(
        `${keyOf(attribute.name)}: ${valueOf({
          context,
          attribute
        })}`
      );
    }
  }

  return properties;
}

function isIgnorable(node: FragmentNode) {
  const isBlankText = node.type === "Text" && node.data.trim() === "";
  return isBlankText || node.type === "Comment";
}

function kindExpressionOf({ context, component, node }: {
  context: MarkupContext;
  component: Exclude<MenuComponent, typeof MenuComponent.MENU>;
  node: AST.Component;
}) {
  const isFixedKind = component !== MenuComponent.ITEM;
  if (isFixedKind) {
    return `${context.kindName}.${FIXED_KINDS[component]}`;
  }

  const attribute = node.attributes.find(isKindAttribute);
  const isDefaultKind = attribute === undefined;
  if (isDefaultKind) {
    return `${context.kindName}.COMMAND`;
  }

  return kindOf({
    context,
    attribute
  });
}

function lowerComponent({ context, node }: {
  context: MarkupContext;
  node: AST.Component;
}) {
  const component = context.components.get(node.name);
  const isForeign = component === undefined;
  if (isForeign) {
    throw errorAt({
      context,
      offset: node.start,
      construct: `the component <${node.name}>`,
      reason: `only ${Object.values(MenuComponent).join(", ")} of winui-svelte/tray/menu/svelte can be lines of the menu, imported by name`
    });
  }

  const isNestedMenu = component === MenuComponent.MENU;
  if (isNestedMenu) {
    throw errorAt({
      context,
      offset: node.start,
      construct: "a nested <TrayMenu>",
      reason: "there is one TrayMenu, the root; use TrayMenuSubmenu for a submenu"
    });
  }

  const properties = [`kind: ${kindExpressionOf({
    context,
    component,
    node
  })}`, ...propertiesOf({
    context,
    component,
    node
  })];
  const isSubmenu = component === MenuComponent.SUBMENU;
  if (isSubmenu) {
    properties.push(
      `items: () => ${arrayOf({
        context,
        fragment: node.fragment
      })}`
    );
    return `{ ${properties.join(", ")} }`;
  }

  const child = node.fragment.nodes.find(candidate => !isIgnorable(candidate));
  if (child) {
    throw errorAt({
      context,
      offset: child.start,
      construct: `children inside <${node.name}>`,
      reason: "only TrayMenuSubmenu holds lines"
    });
  }

  return `{ ${properties.join(", ")} }`;
}

function lowerEach({ context, node }: {
  context: MarkupContext;
  node: AST.EachBlock;
}) {
  if (node.fallback) {
    throw errorAt({
      context,
      offset: node.fallback.nodes[0]?.start ?? node.start,
      construct: "{:else} of {#each}",
      reason: "give the TrayMenuSubmenu an emptyLabel instead"
    });
  }

  const item = node.context ? textOf({
    context,
    node: node.context
  }) : EACH_FALLBACK_PARAMETER;
  const parameters = node.index ? [item, node.index] : [item];
  const isSimple = SIMPLE_LISTS.has(node.expression.type);
  const listText = textOf({
    context,
    node: node.expression
  });
  const list = isSimple ? listText : `(${listText})`;
  const body = arrayOf({
    context,
    fragment: node.body
  });
  return `...${list}.flatMap((${parameters.join(", ")}) => ${body})`;
}

function lowerIf({ context, node }: {
  context: MarkupContext;
  node: AST.IfBlock;
}) {
  const consequent = arrayOf({
    context,
    fragment: node.consequent
  });
  const alternate = node.alternate ? arrayOf({
    context,
    fragment: node.alternate
  }) : "[]";
  const test = textOf({
    context,
    node: node.test
  });
  return `...(${test} ? ${consequent} : ${alternate})`;
}

function lowerNode({ context, node }: {
  context: MarkupContext;
  node: FragmentNode;
}) {
  switch (node.type) {
    case "Component":
      return lowerComponent({
        context,
        node
      });
    case "IfBlock":
      return lowerIf({
        context,
        node
      });
    case "EachBlock":
      return lowerEach({
        context,
        node
      });
    default: {
      const known = NODE_CONSTRUCTS.get(node.type);
      const name = "name" in node ? `<${node.name}>` : node.type;
      throw errorAt({
        context,
        offset: node.start,
        construct: known?.[0] ?? name,
        reason: known?.[1] ?? "only the menu components, {#if}, {#each} and {@const} are read"
      });
    }
  }
}

/**
 * The array expression for the lines under a fragment: the menu components
 * become object literals, `{#if}` and `{#each}` spread arrays, and a
 * const tag becomes a local constant.
 *
 * @param options - The context and the fragment.
 * @returns The text of an array expression.
 */
export function arrayOf({ context, fragment }: {
  context: MarkupContext;
  fragment: AST.Fragment;
}): string {
  const constants: string[] = [];
  const parts: string[] = [];
  for (const node of fragment.nodes) {
    if (isIgnorable(node)) {
      continue;
    }

    const isConstant = node.type === "ConstTag";
    if (isConstant) {
      const { start, end } = spanOf(node.declaration);
      constants.push(`${context.source.slice(start, end)};`);
      continue;
    }

    parts.push(
      lowerNode({
        context,
        node
      })
    );
  }

  const array = `[${parts.join(", ")}]`;
  return constants.length === 0 ? array : `(() => { ${constants.join(" ")} return ${array}; })()`;
}
