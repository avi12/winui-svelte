import { kebab, slug } from "./class-naming.ts";
import { CssKind, PIXEL_UNIT } from "./conversion.ts";
import type { CssValue } from "./conversion.ts";

export const STYLE_DIRECTIVE_PREFIX = "style:";
export const CLASS_DIRECTIVE_PREFIX = "class:";

export const RewriteKind = {
  RULE: "rule",
  TOGGLES: "toggles",
  DIRECTIVE: "directive"
} as const;
export type RewriteKind = (typeof RewriteKind)[keyof typeof RewriteKind];

export interface Declaration {
  property: string;
  value: string;
}

export interface Leaf {
  condition: string;
  value: string;
  modifier: string;
}

export type Rewrite =
  | {
    kind: typeof RewriteKind.RULE;
    declaration: Declaration;
  }
  | {
    kind: typeof RewriteKind.TOGGLES;
    cssProperty: string;
    leaves: Leaf[];
  }
  | {
    kind: typeof RewriteKind.DIRECTIVE;
    cssProperty: string;
    text: string;
  };

interface Guard {
  text: string;
  isNegated: boolean;
}

const SIMPLE_CONDITION = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/u;

function negated(condition: string) {
  return SIMPLE_CONDITION.test(condition) ? `!${condition}` : `!(${condition})`;
}

function conditionOf(path: Guard[]) {
  return path.map(guard => {
    if (guard.isNegated) {
      return negated(guard.text);
    }

    const isNested = path.length > 1 && !SIMPLE_CONDITION.test(guard.text);
    return isNested ? `(${guard.text})` : guard.text;
  }).join(" && ");
}

function modifierOf({ value, cssProperty }: {
  value: Extract<CssValue, { kind: typeof CssKind.PLAIN }>;
  cssProperty: string;
}) {
  const { label, text } = value;
  const hasLabel = label !== undefined;
  if (hasLabel) {
    return kebab(label);
  }

  const isPixels = text.endsWith(PIXEL_UNIT);
  return `${cssProperty}-${slug(isPixels ? text.slice(0, -PIXEL_UNIT.length) : text)}`;
}

// A function that calls itself needs its return type written: TypeScript cannot infer one that refers to itself
function collect(options: {
  value: CssValue;
  path: Guard[];
  cssProperty: string;
}): Leaf[];
function collect({ value, path, cssProperty }: {
  value: CssValue;
  path: Guard[];
  cssProperty: string;
}) {
  const isPlain = value.kind === CssKind.PLAIN;
  if (isPlain) {
    return [{
      condition: conditionOf(path),
      value: value.text,
      modifier: modifierOf({
        value,
        cssProperty
      })
    }];
  }

  const whenTrue = collect({
    value: value.whenTrue,
    path: [...path, {
      text: value.condition,
      isNegated: false
    }],
    cssProperty
  });
  const whenFalse = collect({
    value: value.whenFalse,
    path: [...path, {
      text: value.condition,
      isNegated: true
    }],
    cssProperty
  });
  return [...whenTrue, ...whenFalse];
}

// A function that calls itself needs its return type written: TypeScript cannot infer one that refers to itself
function expressionOf(value: CssValue): string;
function expressionOf(value: CssValue) {
  const isPlain = value.kind === CssKind.PLAIN;
  if (isPlain) {
    return `"${value.text}"`;
  }

  const whenTrue = expressionOf(value.whenTrue);
  const whenFalse = expressionOf(value.whenFalse);
  return `${value.condition} ? ${whenTrue} : ${whenFalse}`;
}

function directiveText({ cssProperty, value }: {
  cssProperty: string;
  value: CssValue;
}) {
  const name = `${STYLE_DIRECTIVE_PREFIX}${cssProperty}`;
  return value.kind === CssKind.PLAIN ? `${name}="${value.text}"` : `${name}={${expressionOf(value)}}`;
}

/**
 * The CSS a value moves to, written as the destination asks: a `style:` directive, a rule in `<style>`, or, for a
 * condition, the classes that toggle the rules the leaves name.
 */
export function rewriteOf({ cssProperty, defaultValue, value, isDirective }: {
  cssProperty: string;
  defaultValue: string | undefined;
  value: CssValue;
  isDirective: boolean;
}) {
  if (isDirective) {
    return {
      kind: RewriteKind.DIRECTIVE,
      cssProperty,
      text: directiveText({
        cssProperty,
        value
      })
    } satisfies Rewrite;
  }

  const isPlain = value.kind === CssKind.PLAIN;
  if (isPlain) {
    return {
      kind: RewriteKind.RULE,
      declaration: {
        property: cssProperty,
        value: value.text
      }
    } satisfies Rewrite;
  }

  const leaves = collect({
    value,
    path: [],
    cssProperty
  }).filter(leaf => leaf.value !== defaultValue);
  return leaves.length === 0 ? undefined : {
    kind: RewriteKind.TOGGLES,
    cssProperty,
    leaves
  } satisfies Rewrite;
}

/**
 * The words of the quick fix's title.
 */
export function titleOf(rewrite: Rewrite) {
  const isDirective = rewrite.kind === RewriteKind.DIRECTIVE;
  if (isDirective) {
    return `Convert to ${STYLE_DIRECTIVE_PREFIX}${rewrite.cssProperty}`;
  }

  const isRule = rewrite.kind === RewriteKind.RULE;
  if (isRule) {
    return `Move to <style> as ${rewrite.declaration.property}: ${rewrite.declaration.value}`;
  }

  return `Move to <style> as ${rewrite.cssProperty}: ${[...new Set(rewrite.leaves.map(leaf => leaf.value))].join(" / ")}`;
}
