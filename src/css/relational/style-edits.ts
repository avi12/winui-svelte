import { flattenChildren, flattenRule, serializeFlatRule } from "./flatten.ts";
import { listNeedsMatching, report, resolveSelectorList } from "./resolve-selector.ts";
import type { Context, ScopeLimit } from "./resolve-selector.ts";
import type { AtRuleBlock, Block, RuleBlock } from "#src/css/parse/parser.js";
import { BlockKind } from "#src/css/parse/parser.js";
import { flattenNestedSelector } from "#src/css/parse/selectors.js";
import { matchingParenthesis } from "#src/css/parse/split.js";

/** A change to the component's source: the text from `start` to `end` becomes `text`. */
export interface Edit {
  start: number;
  end: number;
  text: string;
}

const SCOPE_SELECTOR = ":scope";
const NESTING_SELECTOR = "&";
const LIMIT_KEYWORD = "to";

function absolute({ context, offset }: {
  context: Context;
  offset: number;
}) {
  return context.cssStart + offset;
}

// The selector of the rule itself, replaced in place by what it resolves to.
function selectorEdit({ context, rule }: {
  context: Context;
  rule: RuleBlock;
}) {
  const written = context.css.slice(rule.start, rule.start + rule.selector.length);
  const isReadable = written === rule.selector;
  if (!isReadable) {
    return [];
  }

  const start = absolute({
    context,
    offset: rule.start
  });
  const text = resolveSelectorList({
    context,
    selectors: rule.selector,
    at: start
  });
  return text === rule.selector ? [] : [{
    start,
    end: start + rule.selector.length,
    text
  } satisfies Edit];
}

// Rules nested in this one that need the markup are taken out of it and written at the end of the style.
function hoistEdits({ context, rule }: {
  context: Context;
  rule: RuleBlock;
}) {
  const flat = flattenChildren(rule);
  const isHoisted = flat.some(entry => listNeedsMatching(entry.selector));
  if (!isHoisted) {
    return [];
  }

  const position = absolute({
    context,
    offset: rule.start
  });
  for (const entry of flat) {
    context.hoisted.push(
      serializeFlatRule({
        rule: entry,
        selector: resolveSelectorList({
          context,
          selectors: entry.selector,
          at: position
        }),
        omitted: context.removed
      })
    );
  }

  return [...rule.nested, ...rule.nestedAtRules].map(nested => ({
    start: absolute({
      context,
      offset: nested.start
    }),
    end: absolute({
      context,
      offset: nested.end
    }),
    text: ""
  } satisfies Edit));
}

// `(.card)` or `(.card) to (.limit)`: the text inside the parentheses.
function scopeOf(prelude: string) {
  const text = prelude.trim();
  const isParenthesized = text.startsWith("(");
  if (!isParenthesized) {
    return null;
  }

  const rootEnd = matchingParenthesis({
    text,
    open: 0
  });
  const root = text.slice(1, rootEnd).trim();
  const rest = text.slice(rootEnd + 1).trim();
  const hasLimit = rest.toLowerCase().startsWith(LIMIT_KEYWORD);
  const limitText = rest.slice(LIMIT_KEYWORD.length).trim();
  const limitEnd = hasLimit ? matchingParenthesis({
    text: limitText,
    open: 0
  }) : 0;
  const limit: ScopeLimit | null = hasLimit ? {
    selector: limitText.slice(1, limitEnd).trim()
  } : null;
  const isReadable = root !== "" && (rest === "" || hasLimit);
  return isReadable ? {
    root,
    limit
  } : null;
}

function scopedSelector({ root, selector }: {
  root: string;
  selector: string;
}) {
  return flattenNestedSelector({
    parent: root,
    child: selector.replaceAll(SCOPE_SELECTOR, NESTING_SELECTOR)
  });
}

// An `@scope` is replaced by its rules written out under the root.
function scopeEdits({ context, block }: {
  context: Context;
  block: AtRuleBlock;
}) {
  const position = absolute({
    context,
    offset: block.start
  });
  const scope = scopeOf(block.prelude);
  const children = block.children ?? [];
  const rules = children.filter(child => child.kind === BlockKind.RULE);
  const isUnreadable = scope === null || rules.length !== children.length;
  if (isUnreadable) {
    report({
      context,
      message: "@scope must be written @scope (.root) or @scope (.root) to (.limit), and hold style rules only",
      at: position
    });
    return [];
  }

  const text = rules.flatMap(rule => flattenRule({
    rule,
    parent: null
  })).map(entry => serializeFlatRule({
    rule: entry,
    selector: resolveSelectorList({
      context,
      selectors: scopedSelector({
        root: scope.root,
        selector: entry.selector
      }),
      at: position,
      limit: scope.limit
    }),
    omitted: context.removed
  })).join("\n");
  return [{
    start: position,
    end: absolute({
      context,
      offset: block.end
    }),
    text
  } satisfies Edit];
}

// The rules and the @scope blocks, in the other at-rules too.
function units(blocks: readonly Block[]) {
  const found: (RuleBlock | AtRuleBlock)[] = [];
  const pending = [...blocks];
  while (pending.length > 0) {
    const block = pending.shift();
    const isUnit = block?.kind === BlockKind.RULE || block?.name === "scope";
    if (isUnit) {
      found.push(block);
    } else if (block !== undefined) {
      pending.unshift(...block.children ?? []);
    }
  }

  return found;
}

/** The edits to the `<style>` that resolve every selector, nested rule and `@scope` the markup decides. */
export function styleEdits({ context, blocks }: {
  context: Context;
  blocks: readonly Block[];
}) {
  return units(blocks).flatMap(unit => {
    const isRule = unit.kind === BlockKind.RULE;
    if (isRule) {
      return [...selectorEdit({
        context,
        rule: unit
      }), ...hoistEdits({
        context,
        rule: unit
      })];
    }

    return scopeEdits({
      context,
      block: unit
    });
  });
}
