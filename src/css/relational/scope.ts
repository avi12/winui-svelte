import { applyEdits } from "./relational.ts";
import type { Edit } from "./style-edits.ts";
import type { AST } from "svelte/compiler";
import { parse } from "svelte/compiler";

const INSTANCE_TYPES: ReadonlySet<string> = new Set(["Component", "SvelteComponent", "SvelteSelf"]);
const STAND_IN = "winui-instance";
const QUOTES: ReadonlySet<string> = new Set(["\"", "'"]);

interface Instance {
  start: number;
  end: number;
  name: string;
  attributes: AST.Component["attributes"];
}

function isInstance(node: object): node is Instance {
  const kind = "type" in node ? node.type : null;
  return typeof kind === "string" && INSTANCE_TYPES.has(kind);
}

// The source an acorn node covers (its range is there at run time, and not in the ESTree types).
function textOf({ source, node }: {
  source: string;
  node: object;
}) {
  const start = "start" in node ? node.start : null;
  const end = "end" in node ? node.end : null;
  const isRanged = typeof start === "number" && typeof end === "number";
  return isRanged ? source.slice(start, end) : "undefined";
}

function instancesIn(root: AST.Root) {
  const found: Instance[] = [];
  const pending: unknown[] = [root.fragment];
  for (const node of pending) {
    const isObject = typeof node === "object" && node !== null;
    if (!isObject) {
      continue;
    }

    if (isInstance(node)) {
      found.push(node);
    }

    pending.push(...Object.values(node));
  }

  return found;
}

function parsed(source: string) {
  try {
    return parse(source, { modern: true });
  } catch {
    return null;
  }
}

function isClassAttribute(attribute: Instance["attributes"][number]) {
  return attribute.type === "Attribute" && attribute.name === "class";
}

type InstanceAttribute = Instance["attributes"][number];
type Directive = AST.ClassDirective | AST.StyleDirective;

function directivesOf(instance: Instance) {
  return instance.attributes.filter((attribute): attribute is Directive => (
    attribute.type === "ClassDirective" || attribute.type === "StyleDirective"
  ));
}

function escapeTemplate(text: string) {
  return text.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
}

// An attribute's value as a JavaScript expression: one expression stays itself,
// text mixed with expressions becomes a template.
function partsOf(value: AST.Attribute["value"]) {
  return value === true ? [] : [value].flat();
}

function valueSource({ source, value }: {
  source: string;
  value: AST.Attribute["value"];
}) {
  const parts = partsOf(value);
  const [only] = parts;
  const isSingleExpression = parts.length === 1 && typeof only === "object" && only.type === "ExpressionTag";
  if (isSingleExpression) {
    return `(${textOf({
      source,
      node: only.expression
    })})`;
  }

  const text = parts.map(part => {
    const isText = part.type === "Text";
    if (isText) {
      return escapeTemplate(part.data);
    }

    const expression = textOf({
      source,
      node: part.expression
    });
    return `\${${expression}}`;
  }).join("");
  return `\`${text}\``;
}

function removal(attribute: InstanceAttribute) {
  return {
    start: attribute.start,
    end: attribute.end,
    text: ""
  } satisfies Edit;
}

function directiveExpression({ source, directive }: {
  source: string;
  directive: Directive;
}) {
  const isClass = directive.type === "ClassDirective";
  if (isClass) {
    return textOf({
      source,
      node: directive.expression
    });
  }

  const isShorthand = directive.value === true;
  return isShorthand ? directive.name : valueSource({
    source,
    value: directive.value
  });
}

// A whole attribute rewritten, or added right after the tag's name.
function replaceOrAdd({ instance, written, text }: {
  instance: Instance;
  written: InstanceAttribute | undefined;
  text: string;
}) {
  const nameEnd = instance.start + 1 + instance.name.length;
  return written === undefined ? {
    start: nameEnd,
    end: nameEnd,
    text: ` ${text}`
  } : {
    start: written.start,
    end: written.end,
    text
  };
}

// `style:name={value}` becomes a declaration of the style string, left out for null, undefined and false;
// the string is an expression, so it is rebuilt whenever a value changes.
function styleEditsOf({ source, instance }: {
  source: string;
  instance: Instance;
}) {
  const directives = directivesOf(instance).filter(directive => directive.type === "StyleDirective");
  const hasNone = directives.length === 0;
  if (hasNone) {
    return [];
  }

  const written = instance.attributes.find(attribute => attribute.type === "Attribute" && attribute.name === "style");
  const hasValue = written?.type === "Attribute" && written.value !== true;
  const existing = hasValue ? [valueSource({
    source,
    value: written.value
  })] : [];
  const declarations = directives.map(directive => {
    const important = directive.modifiers.includes("important") ? " !important" : "";
    const value = directiveExpression({
      source,
      directive
    });
    return `((value) => value == null || value === false ? "" : \`${directive.name}: \${value}${important}\`)(${value})`;
  });
  return [replaceOrAdd({
    instance,
    written,
    text: `style={[${[...existing, ...declarations].join(", ")}].filter(Boolean).join("; ")}`
  }), ...directives.map(removal)];
}

// The scope class joins the instance's class value, so the child receives it
// like any class the parent wrote; `class:name={condition}` joins it as a clsx object.
function classEditsOf({ source, instance, scope }: {
  source: string;
  instance: Instance;
  scope: string;
}) {
  const directives = directivesOf(instance).filter(directive => directive.type === "ClassDirective");
  const written = instance.attributes.find(isClassAttribute);
  const hasScope = scope !== "";
  const hasNone = directives.length === 0;
  if (hasNone) {
    return hasScope ? addScopeClass({
      source,
      instance,
      scope
    }) : [];
  }

  const hasValue = written?.type === "Attribute" && written.value !== true;
  const existing = hasValue ? [valueSource({
    source,
    value: written.value
  })] : [];
  const conditions = directives.map(directive => `${JSON.stringify(directive.name)}: ${directiveExpression({
    source,
    directive
  })}`);
  const items = [...existing, ...hasScope ? [JSON.stringify(scope)] : [], `{ ${conditions.join(", ")} }`];
  return [replaceOrAdd({
    instance,
    written,
    text: `class={[${items.join(", ")}]}`
  }), ...directives.map(removal)];
}

// The scope class joins a plain class value.
function addScopeClass({ source, instance, scope }: {
  source: string;
  instance: Instance;
  scope: string;
}) {
  const attribute = instance.attributes.find(isClassAttribute);
  const nameEnd = instance.start + 1 + instance.name.length;
  const isMissing = attribute === undefined || attribute.type !== "Attribute";
  if (isMissing) {
    return [{
      start: nameEnd,
      end: nameEnd,
      text: ` class="${scope}"`
    }];
  }

  const isQuoted = QUOTES.has(source.charAt(attribute.end - 1));
  const hasText = attribute.value === true || isQuoted;
  if (hasText) {
    const isFlag = attribute.value === true;
    const position = isFlag ? attribute.end : attribute.end - 1;
    return [{
      start: position,
      end: position,
      text: isFlag ? `="${scope}"` : ` ${scope}`
    }];
  }

  const [tag] = partsOf(attribute.value);
  const isExpression = tag !== undefined && tag.type === "ExpressionTag";
  if (!isExpression) {
    return [];
  }

  return [{
    start: tag.start + 1,
    end: tag.start + 1,
    text: "["
  }, {
    start: tag.end - 1,
    end: tag.end - 1,
    text: `, "${scope}"]`
  }];
}

// Where `</Name>` starts when the instance has one.
function closingTagStart({ source, instance }: {
  source: string;
  instance: Instance;
}) {
  const text = source.slice(instance.start, instance.end);
  const index = text.lastIndexOf(`</${instance.name}`);
  const isClosed = index > 0 && text.slice(index).trimEnd().endsWith(">");
  return isClosed ? instance.start + index : null;
}

// A component instance written as an element that keeps only what selectors see.
function standIn({ source, instance }: {
  source: string;
  instance: Instance;
}) {
  const nameStart = instance.start + 1;
  const nameEnd = nameStart + instance.name.length;
  const closing = closingTagStart({
    source,
    instance
  });
  const dropped = instance.attributes.filter(attribute => (
    !isClassAttribute(attribute) && attribute.type !== "SpreadAttribute" && attribute.type !== "ClassDirective"
  )).map(attribute => ({
    start: attribute.start,
    end: attribute.end,
    text: ""
  }));
  return [{
    start: nameStart,
    end: nameEnd,
    text: STAND_IN
  }, ...closing === null ? [] : [{
    start: closing + 2,
    end: closing + 2 + instance.name.length,
    text: STAND_IN
  }], ...dropped];
}

/**
 * The component with its scope class added to every component instance it
 * writes (`<TextBlock class="title">` becomes `class="title svelte-x"`, an
 * expression becomes `[expr, "svelte-x"]`), so a rule in its `<style>` reaches
 * its own instances and only them. Svelte adds the class to the elements.
 * `scopeOf` maps the style text to the class (none: no scope class, only the directives lowered).
 */
export function withScopedInstances({ source, scopeOf = () => "" }: {
  source: string;
  scopeOf?: (css: string) => string;
}) {
  const root = parsed(source);
  const isUnreadable = root === null;
  if (isUnreadable) {
    return source;
  }

  return applyEdits({
    source,
    edits: instancesIn(root).flatMap(instance => [...classEditsOf({
      source,
      instance,
      scope: root.css === null ? "" : scopeOf(root.css.content.styles)
    }), ...styleEditsOf({
      source,
      instance
    })])
  });
}

/**
 * The component with each instance written as an element (`<winui-instance>`)
 * that keeps its `class` and spreads: Svelte then matches and scopes the
 * rules against instances too, and its output is the sheet the translator reads.
 */
export function withInstancesAsElements(source: string) {
  const root = parsed(source);
  const isUnreadable = root === null;
  if (isUnreadable) {
    return source;
  }

  return applyEdits({
    source,
    edits: instancesIn(root).flatMap(instance => standIn({
      source,
      instance
    }))
  });
}
