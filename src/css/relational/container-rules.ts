import { declarationOffset } from "./declaration-ranges.ts";
import { flattenRule } from "./flatten.ts";
import type { FlatRule } from "./flatten.ts";
import { matchingElements, UnresolvableSelector } from "./match.ts";
import { report } from "./resolve-selector.ts";
import type { Context } from "./resolve-selector.ts";
import type { TemplateElement } from "./template-elements.ts";
import { parseComplexSelector, splitSelectorList, STATE_PSEUDO_CLASSES } from "#src/css/parse/complex-selector.js";
import type { Compound } from "#src/css/parse/complex-selector.js";
import type { Block } from "#src/css/parse/parser.js";
import { BlockKind } from "#src/css/parse/parser.js";
import type { Declaration } from "#src/css/translate/types.js";

const CLASS_WEIGHT = 100;
const TYPE_WEIGHT = 1;
const WHERE = "where";

/** One selector of a top-level rule, with the declarations it carries and the elements the markup says it matches. */
export interface RuleSubject {
  declarations: readonly Declaration[];
  specificity: number;
  /** Source order among the subjects. */
  order: number;
  matched: readonly TemplateElement[];
}

function specificityOf(compounds: readonly Compound[]) {
  let specificity = 0;
  for (const compound of compounds) {
    const pseudoClasses = compound.pseudoClasses.filter(({ name }) => name !== WHERE);
    specificity += (compound.classes.length + pseudoClasses.length) * CLASS_WEIGHT;
    specificity += compound.elementType === null ? 0 : TYPE_WEIGHT;
  }

  return specificity;
}

// A state on the subject (`:hover`) is the control's to report, which a generated class cannot stand for.
function isStateful(compounds: readonly Compound[]) {
  return compounds.at(-1)?.pseudoClasses.some(({ name }) => STATE_PSEUDO_CLASSES.has(name)) ?? false;
}

// The subject of one selector, or null when it cannot be lowered for (a state, or a match the markup does not decide).
function subjectOf({ context, selector, declarations, order }: {
  context: Context;
  selector: string;
  declarations: readonly Declaration[];
  order: number;
}) {
  const parsed = parseComplexSelector(selector);
  const isUnusable = !parsed.isValid || isStateful(parsed.compounds);
  if (isUnusable) {
    return null;
  }

  try {
    return {
      declarations,
      specificity: specificityOf(parsed.compounds),
      order,
      matched: matchingElements({
        compounds: parsed.compounds,
        elements: context.elements
      })
    } satisfies RuleSubject;
  } catch (error) {
    if (!(error instanceof UnresolvableSelector)) {
      throw error;
    }

    const [first] = declarations;
    report({
      context,
      message: `selector "${selector}": ${error.message}`,
      at: first === undefined ? 0 : declarationOffset({
        context,
        declaration: first
      })
    });
    return null;
  }
}

function subjectsOfRule({ context, flat, members, firstOrder }: {
  context: Context;
  flat: FlatRule;
  members: ReadonlySet<string>;
  firstOrder: number;
}) {
  const declarations = flat.declarations.filter(({ property }) => members.has(property));
  const isRelevant = declarations.length > 0 && flat.wrappers.length === 0;
  if (!isRelevant) {
    return [];
  }

  return splitSelectorList(flat.selector).flatMap((selector, i) => {
    const subject = subjectOf({
      context,
      selector,
      declarations,
      order: firstOrder + i
    });
    return subject === null ? [] : [subject];
  });
}

/**
 * The top-level rules (and the rules nested in them, written out) that carry
 * any of `members`, split per selector, with the elements each matches. A rule
 * in an at-rule (`@media`) holds a value that depends on the window, so it is
 * left to the translator.
 */
export function ruleSubjects({ context, blocks, members }: {
  context: Context;
  blocks: readonly Block[];
  members: ReadonlySet<string>;
}) {
  const subjects: RuleSubject[] = [];
  for (const block of blocks) {
    const isRule = block.kind === BlockKind.RULE;
    if (!isRule) {
      continue;
    }

    for (const flat of flattenRule({
      rule: block,
      parent: null
    })) {
      subjects.push(
        ...subjectsOfRule({
          context,
          flat,
          members,
          firstOrder: subjects.length
        })
      );
    }
  }

  return subjects;
}

/** The declarations that reach an element, weakest first: the cascade's order, `!important` after the rest. */
export function declarationsOf({ subjects, element }: {
  subjects: readonly RuleSubject[];
  element: TemplateElement;
}) {
  const reaching = subjects.filter(subject => subject.matched.includes(element));
  const ordered = reaching.toSorted((first, second) => (
    first.specificity - second.specificity || first.order - second.order
  ));
  const declarations = ordered.flatMap(subject => subject.declarations);
  return [
    ...declarations.filter(declaration => !declaration.isImportant),
    ...declarations.filter(declaration => declaration.isImportant)
  ];
}
