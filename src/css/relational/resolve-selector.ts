import { matchingElements, UnresolvableSelector } from "./match.ts";
import type { TemplateElement } from "./template-elements.ts";
import { parseComplexSelector, splitSelectorList, STATE_PSEUDO_CLASSES } from "#src/css/parse/complex-selector.js";
import type { Compound } from "#src/css/parse/complex-selector.js";
import type { Diagnostic } from "#src/css/translate/types.js";

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

/** What resolving the selectors of one component works on and collects. */
export interface Context {
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
  /** Rules taken out of a nested position and written at the end of the style. */
  hoisted: string[];
  diagnostics: Diagnostic[];
}

/** An `@scope (root) to (limit)`: the selectors inside are under the root and stop at the limit. */
export interface ScopeLimit {
  /** The selector text of the limit, which an element inside it is not styled through. */
  selector: string;
}

/** The line and column of an offset in the source. */
export function positionOf({ source, offset }: {
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

function needsMatching(compounds: readonly Compound[]) {
  const hasCombinator = compounds.length > 1;
  const hasPosition = compounds.some(compound => (
    compound.pseudoClasses.some(({ name }) => NEEDS_MATCHING.has(name))
  ));
  return hasCombinator || hasPosition;
}

/** Whether any selector of a list says something about the element's surroundings. */
export function listNeedsMatching(selectors: string) {
  return splitSelectorList(selectors).some(selector => {
    const parsed = parseComplexSelector(selector);
    return parsed.isValid && needsMatching(parsed.compounds);
  });
}

// The states of the last compound stay on the replaced selector: the control reports them.
function stateSuffix(subject: Compound | undefined) {
  const states = subject?.pseudoClasses.filter(({ name }) => STATE_PSEUDO_CLASSES.has(name)) ?? [];
  return states.map(({ name }) => `:${name}`).join("");
}

// The elements inside the limit: the ones it matches and what is under them.
function insideLimit({ context, limit }: {
  context: Context;
  limit: ScopeLimit | null;
}) {
  const parsed = limit === null ? null : parseComplexSelector(limit.selector);
  const compounds = parsed?.isValid === true ? parsed.compounds : [];
  const limited = new Set(matchingElements({
    compounds,
    elements: compounds.length === 0 ? [] : context.elements
  }));
  return (element: TemplateElement) => {
    for (let candidate: TemplateElement | null = element; candidate !== null; candidate = candidate.parent) {
      const isLimited = limited.has(candidate);
      if (isLimited) {
        return true;
      }
    }

    return false;
  };
}

/** Records a problem with the selector written at `at`. */
export function report({ context, message, at }: {
  context: Context;
  message: string;
  at: number;
}) {
  context.diagnostics.push({
    severity: "error",
    message,
    file: context.file,
    at: positionOf({
      source: context.source,
      offset: at
    })
  });
}

function resolveSelector({ context, selector, at, limit }: {
  context: Context;
  selector: string;
  at: number;
  limit: ScopeLimit | null;
}) {
  const parsed = parseComplexSelector(selector);
  const isPlain = !parsed.isValid || !needsMatching(parsed.compounds);
  if (isPlain) {
    return selector;
  }

  const key = `${selector}|${limit?.selector ?? ""}`;
  const known = context.names.get(key);
  const name = known ?? `${CLASS_PREFIX}${context.names.size + 1}`;
  const isNew = known === undefined;
  if (isNew) {
    context.names.set(key, name);
    try {
      const isLimited = insideLimit({
        context,
        limit
      });
      const styled = matchingElements({
        compounds: parsed.compounds,
        elements: context.elements
      }).filter(element => !isLimited(element));
      for (const element of styled) {
        context.given.set(element, [...context.given.get(element) ?? [], name]);
      }
    } catch (error) {
      if (!(error instanceof UnresolvableSelector)) {
        throw error;
      }

      report({
        context,
        message: `selector "${selector}": ${error.message}`,
        at
      });
      return selector;
    }
  }

  return `.${name}${stateSuffix(parsed.compounds.at(-1))}`;
}

/** A selector list with each selector resolved to the generated class its elements get. */
export function resolveSelectorList({ context, selectors, at, limit = null }: {
  context: Context;
  selectors: string;
  at: number;
  limit?: ScopeLimit | null;
}) {
  return splitSelectorList(selectors).map(selector => resolveSelector({
    context,
    selector,
    at,
    limit
  })).join(", ");
}
