import type { StateElement, VisualStates } from "./runtime.ts";
import { describeRules, extraGroups, lowerOptions, versionedId } from "./runtime.ts";
import { computeDeclarations } from "#src/css/translate/cascade.js";
import type { RankedRule } from "#src/css/translate/cascade.js";
import { xamlTypeName } from "#src/css/translate/cascade.js";
import { lowerDeclarations } from "#src/css/translate/properties.js";
import type { WriteSeam } from "#src/css/translate/property-kit.js";
import { planVisualStates } from "#src/css/translate/state-properties.js";

/** What makes the visual states of a template draw brushes, once the template is applied. */
export type StateFiller = (input: {
  native: WriteSeam;
  control: object;
  /** The name of the template part the states change. */
  part: string;
  states: readonly {
    state: string;
    /** The brush of each property (`Background`), as a color, a `{ThemeResource Key}` or the XAML of a brush. */
    brushes: readonly {
      property: string;
      source: string;
    }[];
  }[];
}) => () => void;

interface Applied {
  signature: string;
  undo: () => void;
}

function brushesOf({ element, state, ranked }: {
  element: StateElement;
  state: string;
  ranked: RankedRule[];
}) {
  const problems: string[] = [];
  const lowered = lowerDeclarations({
    computed: computeDeclarations({
      matched: ranked.map(({ rule }) => rule),
      inline: []
    }),
    options: lowerOptions({
      elementType: element.elementType,
      problems
    }),
    extraGroups: [...extraGroups.values()]
  });
  const hasProblems = problems.length > 0;
  if (hasProblems) {
    throw new Error(`<${element.elementType}> cannot take the ${state} state of ${describeRules([...ranked])}: ${problems.join("; ")}`);
  }

  const brushes = lowered.setters.map(output => ({
    property: output.property,
    source: output.kind === "setter" ? output.value : output.xaml
  }));
  return {
    state,
    brushes
  };
}

/**
 * The visual states of a templated control: a Button's `:hover`, `:active` and
 * `:disabled` brushes go to `fill`, which makes its template draw them, and the
 * runtime builds the Style from the rest.
 */
export function visualStatesWith(fill: StateFiller) {
  const applied = new WeakMap<object, Applied>();
  // The states' brushes change with the rules that match, not with the
  // template's own events, so they are written again only when those change.
  function drive(element: StateElement, rules: RankedRule[], native: WriteSeam) {
    const plan = planVisualStates({
      elementType: element.elementType,
      rules
    });
    const isDriven = plan !== null;
    if (!isDriven) {
      return null;
    }

    const states = [...plan.states].map(([state, ranked]) => ({
      state,
      ranked: ranked.filter(({ rule }) => element.queries?.isMediaActive(rule) ?? true)
    }));
    const signature = states.map(({ state, ranked }) => `${state}=${ranked.map(({ id }) => versionedId(id)).join(",")}`).join(";");
    const previous = applied.get(element.control);
    const isApplied = (previous?.signature ?? "") === signature;
    if (isApplied) {
      return plan.rest;
    }

    previous?.undo();
    applied.delete(element.control);
    const hasStates = states.length > 0;
    if (hasStates) {
      applied.set(element.control, {
        signature,
        undo: fill({
          native,
          control: element.control,
          part: xamlTypeName(plan.part),
          states: states.map(({ state, ranked }) => brushesOf({
            element,
            state,
            ranked
          }))
        })
      });
    }

    return plan.rest;
  }

  return { drive } satisfies VisualStates;
}
