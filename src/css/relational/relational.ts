import { UnresolvableSelector } from "./match.ts";
import { positionOf } from "./resolve-selector.ts";
import type { Context } from "./resolve-selector.ts";
import { styleEdits } from "./style-edits.ts";
import type { Edit } from "./style-edits.ts";
import { templateElements } from "./template-elements.ts";
import type { TemplateElement } from "./template-elements.ts";
import { CssSyntaxError, parseCss } from "#src/css/parse/parser.js";
import type { Diagnostic } from "#src/css/translate/types.js";
import type { AST } from "svelte/compiler";
import { parse } from "svelte/compiler";

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
    hoisted: [],
    diagnostics: []
  };
  const edits = styleEdits({
    context,
    blocks
  });
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
    const hoistedEdits = context.hoisted.length === 0 ? [] : [{
      start: style.end,
      end: style.end,
      text: `\n${context.hoisted.join("\n")}\n`
    } satisfies Edit];
    return {
      source: applyEdits({
        source,
        edits: [...edits, ...hoistedEdits, ...markupEdits]
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
        at: positionOf({
          source,
          offset: style.start
        })
      }]
    };
  }
}
