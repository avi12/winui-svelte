import type { RuleBlock } from "#src/css/parse/parser.js";
import { BlockKind } from "#src/css/parse/parser.js";
import { flattenNestedSelector } from "#src/css/parse/selectors.js";
import type { Declaration } from "#src/css/translate/types.js";

/** One style rule with its nesting written out: a full selector, its declarations, and the at-rules around it. */
export interface FlatRule {
  selector: string;
  declarations: readonly Declaration[];
  /** The at-rules it sits in, outermost first: `@media (min-width: 600px)`. */
  wrappers: readonly string[];
}

interface Pending {
  rule: RuleBlock;
  parent: string | null;
  wrappers: readonly string[];
}

// The rules nested in a rule, with the selector they nest under and the at-rules around them.
function nestedIn({ rule, selector, wrappers }: {
  rule: RuleBlock;
  selector: string;
  wrappers: readonly string[];
}) {
  const nested = rule.nested.map(child => ({
    rule: child,
    parent: selector,
    wrappers
  } satisfies Pending));
  const inAtRules = rule.nestedAtRules.flatMap(atRule => (atRule.children ?? []).flatMap(child => (
    child.kind === BlockKind.RULE ? [{
      rule: child,
      parent: selector,
      wrappers: [...wrappers, `@${atRule.name} ${atRule.prelude}`]
    } satisfies Pending] : []
  )));
  return [...nested, ...inAtRules];
}

function flatten(start: Pending[]) {
  const flat: FlatRule[] = [];
  const pending = [...start];
  while (pending.length > 0) {
    const { rule, parent, wrappers } = pending.shift() ?? {
      rule: null,
      parent: null,
      wrappers: []
    };
    const isDone = rule === null;
    if (isDone) {
      break;
    }

    const selector = parent === null ? rule.selector : flattenNestedSelector({
      parent,
      child: rule.selector
    });
    const hasDeclarations = rule.declarations.length > 0;
    if (hasDeclarations) {
      flat.push({
        selector,
        declarations: rule.declarations,
        wrappers
      });
    }

    pending.unshift(
      ...nestedIn({
        rule,
        selector,
        wrappers
      })
    );
  }

  return flat;
}

/**
 * A rule and everything nested in it as top-level rules (CSS Nesting written
 * out): `&` is the selector around, a nested selector without it is a
 * descendant, and an at-rule inside a rule wraps the rule's own selector.
 */
export function flattenRule({ rule, parent }: {
  rule: RuleBlock;
  parent: string | null;
}) {
  return flatten([{
    rule,
    parent,
    wrappers: []
  }]);
}

/** What is nested in a rule, written out; the rule's own declarations are not in it. */
export function flattenChildren(rule: RuleBlock) {
  return flatten(
    nestedIn({
      rule,
      selector: rule.selector,
      wrappers: []
    })
  );
}

function declarationText(declaration: Declaration) {
  const important = declaration.isImportant ? " !important" : "";
  return `${declaration.property}: ${declaration.value}${important};`;
}

/** A flat rule as CSS text, inside its at-rules. */
export function serializeFlatRule({ rule, selector }: {
  rule: FlatRule;
  /** The selector to write: the rule's own, or what it was resolved to. */
  selector: string;
}) {
  const body = `${selector} { ${rule.declarations.map(declarationText).join(" ")} }`;
  let text = body;
  for (const wrapper of [...rule.wrappers].reverse()) {
    text = `${wrapper} { ${text} }`;
  }

  return text;
}
