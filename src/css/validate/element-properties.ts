import { positionAt } from "./diagnostic.ts";
import { levels } from "#src/components/generated/metadata.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import { templateElements } from "#src/css/relational/template-elements.js";
import type { TemplateElement } from "#src/css/relational/template-elements.js";
import { resolveBuiltVariable } from "#src/css/translate/cascade.js";
import { buildTimeGroups } from "#src/css/translate/lazy-groups.js";
import { lowerDeclarations } from "#src/css/translate/properties.js";
import type { Declaration, Diagnostic, Keyframes, Rule } from "#src/css/translate/types.js";
import { parse } from "svelte/compiler";
import type { AST } from "svelte/compiler";

const COMPONENT_MODULE = /^winui-svelte(?:\/|$)/u;
const SCOPE_CLASS = /^svelte-/u;
const ATTACHED_SEPARATOR = ".";
const PATH_SEPARATOR = /[\\/]/u;
const WRITTEN_PROPERTY = /^[\w-]+/u;
const LINE_BREAK = "\n";

interface Catalogue {
  tags: Map<string, string>;
  properties: Map<string, ReadonlySet<string>>;
}

let catalogue: Catalogue | null = null;

function makeCatalogue() {
  const tags = new Map<string, string>();
  for (const [name, level] of Object.entries(levels)) {
    if (level.isComponent) {
      tags.set(level.tag, name);
    }
  }

  return {
    tags,
    properties: new Map<string, ReadonlySet<string>>()
  } satisfies Catalogue;
}

// The components by tag, read once; the properties of each are added as they are asked for.
function catalogueOf() {
  catalogue ??= makeCatalogue();
  return catalogue;
}

// A Style setter names a dependency property by its WinUI name; the metadata keeps it in lowerCamelCase.
function propertiesOf(name: string) {
  const known = catalogueOf().properties.get(name);
  const isKnown = known !== undefined;
  if (isKnown) {
    return known;
  }

  const found = new Set<string>();
  let level = levels[name];
  while (level !== undefined) {
    for (const property of level.properties) {
      found.add(property.toLowerCase());
    }

    level = level.parent === null ? undefined : levels[level.parent];
  }

  catalogueOf().properties.set(name, found);
  return found;
}

// The component class (`PathIcon`) a tag (`path-icon`) is, or undefined for a tag the package does not know.
function componentOfTag(tag: string) {
  return catalogueOf().tags.get(tag);
}

// An attached property (`Grid.Row`) belongs to its owner, not to the element it is set on.
function isSupported({ tag, property }: {
  tag: string;
  property: string;
}) {
  const component = componentOfTag(tag);
  const isUnknown = component === undefined;
  const isAttached = property.includes(ATTACHED_SEPARATOR);
  const isExempt = isUnknown || isAttached;
  if (isExempt) {
    return true;
  }

  return propertiesOf(component).has(property.toLowerCase());
}

type Imported = Map<string, string>;

// The WinUI components the file imports from the package, by the lower-case name it uses them under.
function importedComponents(root: AST.Root) {
  const imported: Imported = new Map();
  for (const node of root.instance?.content.body ?? []) {
    const isFromPackage = node.type === "ImportDeclaration" && COMPONENT_MODULE.test(String(node.source.value));
    if (!isFromPackage) {
      continue;
    }

    for (const specifier of node.specifiers) {
      const original = specifier.type === "ImportSpecifier" ? specifier.imported : null;
      const isIdentifier = original?.type === "Identifier";
      if (isIdentifier) {
        imported.set(specifier.local.name.toLowerCase(), original.name);
      }
    }
  }

  return imported;
}

function tagOf({ element, imported }: {
  element: TemplateElement;
  imported: Imported;
}) {
  if (!element.isInstance) {
    return componentOfTag(element.name) === undefined ? null : element.name;
  }

  const original = imported.get(element.name);
  const level = original === undefined ? undefined : levels[original];
  return level?.isComponent === true ? level.tag : null;
}

function isUsedBy({ rule, element }: {
  rule: Rule;
  element: TemplateElement;
}) {
  const wanted = rule.classes.filter(name => !SCOPE_CLASS.test(name));
  const hasClasses = wanted.every(name => element.classes.includes(name) || element.conditionalClasses.includes(name));
  const hasNoExcluded = (rule.notClasses ?? []).every(name => !element.classes.includes(name));
  return hasClasses && hasNoExcluded;
}

// Every element type a rule can style in this component, with the first element that uses it: the rule's own
// type, or the types of the elements that carry its classes.
function usagesOf({ rule, elements, imported }: {
  rule: Rule;
  elements: readonly TemplateElement[];
  imported: Imported;
}) {
  const used = new Map<string, TemplateElement | null>();
  const { elementType } = rule;
  const hasType = elementType !== null;
  if (hasType) {
    used.set(elementType, null);
  }

  const hasClasses = rule.classes.some(name => !SCOPE_CLASS.test(name));
  for (const element of elements) {
    const tag = tagOf({
      element,
      imported
    });
    const isElementKnown = tag !== null;
    if (!isElementKnown) {
      continue;
    }

    const isTypeMatch = rule.elementType === null ? hasClasses : rule.elementType === tag;
    const isCandidate = isTypeMatch && used.get(tag) == null;
    const isUsed = isCandidate && isUsedBy({
      rule,
      element
    });
    if (isUsed) {
      used.set(tag, element);
    }
  }

  return used;
}

interface Lowered {
  errors: string[];
  properties: string[];
}

function lowerAlone({ declaration, tag, keyframes }: {
  declaration: Declaration;
  tag: string | null;
  keyframes: readonly Keyframes[];
}) {
  const lowered: Lowered = {
    errors: [],
    properties: []
  };
  const options: LowerOptions = {
    elementType: tag,
    resolveVariable: resolveBuiltVariable,
    keyframes: {
      find: name => keyframes.findLast(candidate => candidate.name === name),
      isComplete: false
    },
    hasStyle: () => true,
    report({ severity, message }) {
      const isError = severity === "error";
      if (isError) {
        lowered.errors.push(message);
      }
    }
  };
  try {
    const style = lowerDeclarations({
      computed: new Map([[declaration.property, declaration]]),
      options,
      extraGroups: buildTimeGroups()
    });
    lowered.properties = style.setters.flatMap(output => output.kind === "setter" ? [output.property] : []);
  } catch {
    // A group that needs a sibling declaration cannot be lowered alone: the translation reports what is wrong with it.
    return {
      errors: [],
      properties: []
    } satisfies Lowered;
  }

  return lowered;
}

function selectorOf(rule: Rule) {
  const classes = rule.classes.filter(name => !SCOPE_CLASS.test(name)).map(name => `.${name}`);
  return `${rule.elementType ?? ""}${classes.join("")}`;
}

// A shorthand reaches the lowering as its longhands, all at the shorthand's place: say what the author wrote.
function writtenProperty({ source, declaration }: {
  source: string;
  declaration: Declaration;
}) {
  const { line, column } = declaration.at;
  const text = source.split(LINE_BREAK)[line - 1]?.slice(column - 1) ?? "";
  return WRITTEN_PROPERTY.exec(text)?.[0] ?? declaration.property;
}

function nameOf(path: string) {
  return path.split(PATH_SEPARATOR).at(-1) ?? path;
}

// What one declaration sets that the element type cannot take: the lowering's own refusals for the type (a gap on
// a border), and the WinUI properties its setters name that the type and its parents lack.
function problemsOf({ declaration, tag, source, keyframes }: {
  declaration: Declaration;
  tag: string;
  source: string;
  keyframes: readonly Keyframes[];
}) {
  const generic = new Set(
    lowerAlone({
      declaration,
      tag: null,
      keyframes
    }).errors
  );
  const lowered = lowerAlone({
    declaration,
    tag,
    keyframes
  });
  const written = writtenProperty({
    source,
    declaration
  });
  const unsupported = lowered.properties
    .filter(property => !isSupported({
      tag,
      property
    }))
    .map(property => `property ${written} is not supported on <${tag}> (WinUI's ${componentOfTag(tag)} has no ${property})`);
  return [...lowered.errors.filter(message => !generic.has(message)), ...unsupported];
}

/** What to check a component's rules against. */
export interface ElementPropertyInput {
  /** The component as the translation read it (relational selectors resolved). */
  markup: string;
  /** The component as written: the declarations' positions are in it. */
  source: string;
  filename: string;
  rules: readonly Rule[];
  keyframes: readonly Keyframes[];
}

function usageOf({ rule, tag, element, input }: {
  rule: Rule;
  tag: string;
  element: TemplateElement | null;
  input: ElementPropertyInput;
}) {
  const line = element === null ? rule.declarations[0]?.at.line ?? 1 : positionAt({
    source: input.markup,
    character: element.start
  }).line;
  return `${selectorOf(rule) || "*"} on <${tag}> at ${nameOf(input.filename)}:${line}`;
}

/**
 * The declarations a rule sets that an element type the rule styles cannot
 * take, found now rather than when WinUI refuses the Style as the window
 * opens. The element types are the ones a rule can match here: its own type
 * selector, and the WinUI elements and component instances that statically
 * carry its classes. A class set by an expression, a spread or a component of
 * the app's own is not known, so it is never reported. A property the type
 * holds through its parents, or as an attached one, is valid.
 */
export function elementPropertyDiagnostics(input: ElementPropertyInput) {
  const { markup, filename, rules } = input;
  let elements: TemplateElement[] = [];
  let imported: Imported = new Map();
  try {
    const root = parse(markup, { modern: true });
    elements = templateElements({
      root,
      source: markup
    });
    imported = importedComponents(root);
  } catch {
    return [];
  }

  const diagnostics = new Map<string, Diagnostic>();
  for (const rule of rules) {
    for (const [tag, element] of usagesOf({
      rule,
      elements,
      imported
    })) {
      const used = usageOf({
        rule,
        tag,
        element,
        input
      });
      const found = rule.declarations.flatMap(declaration => problemsOf({
        declaration,
        tag,
        source: input.source,
        keyframes: input.keyframes
      }).map(message => ({
        message,
        declaration
      })));
      for (const { message, declaration } of found) {
        diagnostics.set(`${declaration.at.line}:${declaration.at.column}:${message}`, {
          severity: "error",
          message: `${message} (used by ${used})`,
          file: filename,
          at: declaration.at
        });
      }
    }
  }

  return [...diagnostics.values()];
}
