import type { Declaration, Rule } from "./types.ts";
import { MOTION_ALWAYS_CLASS } from "#src/motion.js";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
const HALF_STEP = 0.5;

function isMotion(property: string) {
  return property === "transition" || property.startsWith("animation");
}

// The query the added rule applies under: the rule's own, and reduced motion.
function reducedQuery(rule: Rule) {
  const own = rule.media?.query;
  const isUnqueried = own === undefined;
  if (isUnqueried) {
    return REDUCED_MOTION;
  }

  const isList = own.includes(",");
  return isList ? null : `${own} and ${REDUCED_MOTION}`;
}

function stopping(source: Declaration) {
  return {
    ...source,
    property: source.property === "transition" ? "transition" : "animation",
    value: "none"
  } satisfies Declaration;
}

/**
 * Follows each rule that transitions or animates with a copy that turns both
 * off under `prefers-reduced-motion: reduce`, so the OS setting is honoured
 * with no work from the author: the copy sits right after its rule (it wins
 * over it, and a later rule of the author's wins over it), skips an element
 * that has the `winui-motion-always` class, and is the same
 * `@media` rule the author could have written by hand.
 *
 * @param rules - The rules of a sheet, in place: the copies are added to it.
 */
export function addReducedMotionRules(rules: Rule[]) {
  const added: Rule[] = [];
  for (const rule of rules) {
    const motion = rule.declarations.filter(declaration => isMotion(declaration.property));
    const isUnanimated = motion.length === 0 || rule.startingStyle === true;
    const query = reducedQuery(rule);
    const isHandled = rule.media?.container !== undefined || rule.media?.query?.includes("prefers-reduced-motion") === true;
    const isSkipped = isUnanimated || query === null || isHandled;
    if (isSkipped) {
      continue;
    }

    const stops = new Map(motion.map(declaration => [stopping(declaration).property, stopping(declaration)]));
    added.push({
      elementType: rule.elementType,
      classes: rule.classes,
      notClasses: [...rule.notClasses ?? [], MOTION_ALWAYS_CLASS],
      ...rule.layer === undefined ? {} : { layer: rule.layer },
      state: rule.state,
      specificity: rule.specificity,
      order: rule.order + HALF_STEP,
      declarations: [...stops.values()],
      media: {
        minWidth: rule.media?.minWidth ?? null,
        maxWidth: rule.media?.maxWidth ?? null,
        minHeight: rule.media?.minHeight ?? null,
        maxHeight: rule.media?.maxHeight ?? null,
        query
      },
      resourcesXaml: null
    });
  }

  rules.push(...added);
}
