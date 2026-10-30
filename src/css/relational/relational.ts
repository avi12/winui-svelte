import { lowerContainers } from "./containers.ts";
import { UnresolvableSelector } from "./match.ts";
import { applyMoves } from "./reorder.ts";
import type { Move } from "./reorder.ts";
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

// An edit inside the range another one replaces is part of that one.
function isInside({ edit, other }: {
  edit: Edit;
  other: Edit;
}) {
  const isEmpty = edit.start === edit.end;
  const isInsideEmpty = other.start < edit.start && edit.end < other.end;
  const isInsideRange = other.start <= edit.start && edit.end <= other.end;
  const isWithin = isEmpty ? isInsideEmpty : isInsideRange;
  return other !== edit && isWithin && other.end - other.start > edit.end - edit.start;
}

function applyEdits({ source, edits, moves }: {
  source: string;
  edits: readonly Edit[];
  moves: readonly Move[];
}) {
  const applied = edits.filter(edit => !edits.some(other => isInside({
    edit,
    other
  })));
  let text = source;
  for (const edit of applied.toSorted((first, second) => second.start - first.start)) {
    text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
  }

  function shift(offset: number) {
    let shifted = offset;
    for (const edit of applied) {
      const isBefore = edit.end <= offset;
      shifted += isBefore ? edit.text.length - (edit.end - edit.start) : 0;
    }

    return shifted;
  }
  return applyMoves({
    text,
    moves,
    shift
  });
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
    prelude: [],
    removed: new Set(),
    diagnostics: []
  };
  const lowering = lowerContainers({
    context,
    blocks
  });
  const edits = [
    ...lowering.edits,
    ...styleEdits({
      context,
      blocks
    })
  ];
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
    const preludeEdits = context.prelude.length === 0 ? [] : [{
      start: style.start,
      end: style.start,
      text: `\n${context.prelude.join("\n")}\n`
    } satisfies Edit];
    return {
      source: applyEdits({
        source,
        edits: [...edits, ...hoistedEdits, ...markupEdits, ...preludeEdits],
        moves: lowering.moves
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
