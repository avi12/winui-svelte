import { matchingElements, UnresolvableSelector } from "./match.ts";
import { templateElements } from "./template-elements.ts";
import type { TemplateElement } from "./template-elements.ts";
import { parseComplexSelector, splitSelectorList, STATE_PSEUDO_CLASSES } from "#src/css/parse/complex-selector.js";
import type { Compound } from "#src/css/parse/complex-selector.js";
import type { Block, RuleBlock } from "#src/css/parse/parser.js";
import { BlockKind, CssSyntaxError, parseCss } from "#src/css/parse/parser.js";
import type { Diagnostic } from "#src/css/translate/types.js";
import type { AST } from "svelte/compiler";
import { parse } from "svelte/compiler";

const CLASS_PREFIX = "wsc-";
const NEEDS_MATCHING: ReadonlySet<string> = new Set([
  "first-child",
  "last-child",
  "only-child",
  "nth-child",
  "nth-last-child",
  "is",
  "has"
]);

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Context {
  source: string;
  file: string;
  /** Where the `<style>` content starts in the source. */
  cssStart: number;
  css: string;
  elements: TemplateElement[];
  /** The generated class of each selector resolved, by the selector's text. */
  names: Map<string, string>;
  /** The generated classes each element is given. */
  given: Map<TemplateElement, string[]>;
  diagnostics: Diagnostic[];
}

function positionOf({ source, offset }: {
  source: string;
  offset: number;
}) {
  const before = source.slice(0, offset);
  const lines = before.split("\n");
  return {
    line: lines.length,
    column: (lines.at(-1) ?? "").length + 1
  };
}

function offsetInCss({ css, line, column }: {
  css: string;
  line: number;
  column: number;
}) {
  const lines = css.split("\n");
  let before = 0;
  for (const text of lines.slice(0, line - 1)) {
    before += text.length + 1;
  }

  return before + column - 1;
}

function needsMatching(compounds: readonly Compound[]) {
  const hasCombinator = compounds.length > 1;
  const hasPosition = compounds.some(compound => compound.pseudoClasses.some(({ name }) => NEEDS_MATCHING.has(name)));
  return hasCombinator || hasPosition;
}

// The states of the last compound stay on the replaced selector: the control reports them.
function stateSuffix(subject: Compound | undefined) {
  const states = subject?.pseudoClasses.filter(({ name }) => STATE_PSEUDO_CLASSES.has(name)) ?? [];
  return states.map(({ name }) => `:${name}`).join("");
}

function resolveSelector({ context, selector, at }: {
  context: Context;
  selector: string;
  at: number;
}) {
  const parsed = parseComplexSelector(selector);
  const isPlain = !parsed.isValid || !needsMatching(parsed.compounds);
  if (isPlain) {
    return selector;
  }

  const known = context.names.get(selector);
  const name = known ?? `${CLASS_PREFIX}${context.names.size + 1}`;
  const isNew = known === undefined;
  if (isNew) {
    context.names.set(selector, name);
    try {
      for (const element of matchingElements({
        compounds: parsed.compounds,
        elements: context.elements
      })) {
        context.given.set(element, [...context.given.get(element) ?? [], name]);
      }
    } catch (error) {
      if (!(error instanceof UnresolvableSelector)) {
        throw error;
      }

      context.diagnostics.push({
        severity: "error",
        message: `selector "${selector}": ${error.message}`,
        file: context.file,
        at: positionOf({
          source: context.source,
          offset: at
        })
      });
      return selector;
    }
  }

  return `.${name}${stateSuffix(parsed.compounds.at(-1))}`;
}

function ruleEdit({ context, rule }: {
  context: Context;
  rule: RuleBlock;
}) {
  const offset = offsetInCss({
    css: context.css,
    line: rule.at.line,
    column: rule.at.column
  });
  const written = context.css.slice(offset, offset + rule.selector.length);
  const isReadable = written === rule.selector;
  if (!isReadable) {
    return [];
  }

  const start = context.cssStart + offset;
  const selectors = splitSelectorList(rule.selector).map(selector => resolveSelector({
    context,
    selector,
    at: start
  }));
  const text = selectors.join(", ");
  return text === rule.selector ? [] : [{
    start,
    end: start + rule.selector.length,
    text
  } satisfies Edit];
}

// Every style rule, in the at-rules too.
function ruleBlocks(blocks: readonly Block[]) {
  const rules: RuleBlock[] = [];
  const pending = [...blocks];
  while (pending.length > 0) {
    const block = pending.shift();
    const isRule = block?.kind === BlockKind.RULE;
    if (isRule) {
      rules.push(block);
    } else if (block !== undefined) {
      pending.unshift(...block.children ?? []);
    }
  }

  return rules;
}

// A class goes into the element's class attribute, or becomes one.
function classEdit({ element, names }: {
  element: TemplateElement;
  names: readonly string[];
}) {
  const text = names.join(" ");
  const { classEnd } = element;
  const hasClassAttribute = classEnd !== null;
  if (hasClassAttribute) {
    return {
      start: classEnd,
      end: classEnd,
      text: ` ${text}`
    } satisfies Edit;
  }

  if (element.hasDynamicClass) {
    throw new UnresolvableSelector(`<${element.name}> sets its class with an expression, a class: directive or a spread, so a generated class cannot be added`);
  }

  return {
    start: element.nameEnd,
    end: element.nameEnd,
    text: ` class="${text}"`
  } satisfies Edit;
}

function applyEdits({ source, edits }: {
  source: string;
  edits: readonly Edit[];
}) {
  let text = source;
  for (const edit of [...edits].sort((first, second) => second.start - first.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }

  return text;
}

function parseTemplate(source: string) {
  try {
    return parse(source, { modern: true });
  } catch {
    return null;
  }
}

function styleOf(root: AST.Root | null) {
  const content = root?.css?.content;
  const isMissing = root === null || content === undefined;
  return isMissing ? null : {
    root,
    start: content.start,
    end: content.end
  };
}

function cssBlocks(css: string) {
  try {
    return parseCss(css);
  } catch (error) {
    const isSyntaxError = error instanceof CssSyntaxError;
    if (isSyntaxError) {
      return null;
    }

    throw error;
  }
}

/**
 * Rewrites a component so a Style can express what a selector says about an
 * element's surroundings. A Style applies to one element by its type and classes;
 * the markup is known at build time, so each descendant, child or sibling
 * selector, `:first-child`, `:last-child`, `:only-child`, `:nth-child()` and
 * `:is()` is matched against the template and its subject elements are given a
 * generated class (`wsc-1`), which the selector then names. The returned source
 * is what Svelte and the sheet translation should both compile.
 *
 * A selector that depends on what the markup does not fix (a class set by an
 * expression, siblings in an `{#each}` or beside a component, `:has()`) comes
 * back as a diagnostic with the line, and stays as written.
 */
export function resolveRelationalSelectors({ source, file }: {
  source: string;
  file: string;
}) {
  const diagnostics: Diagnostic[] = [];
  const unchanged = {
    source,
    diagnostics
  };
  const style = styleOf(parseTemplate(source));
  const hasNoStyle = style === null;
  if (hasNoStyle) {
    return unchanged;
  }

  const css = source.slice(style.start, style.end);
  const blocks = cssBlocks(css);
  const isUnreadable = blocks === null;
  if (isUnreadable) {
    return unchanged;
  }

  const context: Context = {
    source,
    file,
    cssStart: style.start,
    css,
    elements: templateElements({
      root: style.root,
      source
    }),
    names: new Map(),
    given: new Map(),
    diagnostics: []
  };
  const edits = ruleBlocks(blocks).flatMap(rule => ruleEdit({
    context,
    rule
  }));
  const hasErrors = context.diagnostics.length > 0;
  if (hasErrors) {
    return {
      source,
      diagnostics: context.diagnostics
    };
  }

  try {
    const markupEdits = [...context.given].map(([element, names]) => classEdit({
      element,
      names
    }));
    return {
      source: applyEdits({
        source,
        edits: [...edits, ...markupEdits]
      }),
      diagnostics: []
    };
  } catch (error) {
    if (!(error instanceof UnresolvableSelector)) {
      throw error;
    }

    return {
      source,
      diagnostics: [{
        severity: "error" as const,
        message: error.message,
        file,
        at: {
          line: 1,
          column: 1
        }
      }]
    };
  }
}
