import type { RankedRule } from "./cascade.ts";
import { PseudoState } from "./types.ts";

/** The states of the `CommonStates` group of a WinUI control template. */
export const CommonState = {
  NORMAL: "Normal",
  POINTER_OVER: "PointerOver",
  PRESSED: "Pressed",
  DISABLED: "Disabled"
} as const;

/** The states of the `FocusStates` group of a WinUI control template. */
export const FocusState = {
  FOCUSED: "Focused",
  UNFOCUSED: "Unfocused",
  POINTER_FOCUSED: "PointerFocused"
} as const;

/**
 * The CSS properties a template's own states override: its PointerOver and
 * Pressed states set the brushes of the template part, which beats the Style
 * setter of the same property on the control. These are the ones a state rule
 * hands to the template's visual states; every other property of a state rule
 * stays a Style setter, which the template leaves alone.
 */
export const VISUAL_STATE_MEMBERS: readonly string[] = ["background-color", "background-image", "color", "border-color"];

/**
 * The visual states each pseudo-class is, in the order the web names them.
 * `:focus` is both the keyboard and the pointer focus; `:focus-visible` is the
 * keyboard's alone. `:checked` has no entry: a CheckStates state is a
 * combination with the pointer states (`CheckedPointerOver`), which a single
 * pseudo-class cannot name.
 */
export const STATE_TARGETS: ReadonlyMap<PseudoState, readonly string[]> = new Map([
  [PseudoState.HOVER, [CommonState.POINTER_OVER]],
  [PseudoState.ACTIVE, [CommonState.PRESSED]],
  [PseudoState.DISABLED, [CommonState.DISABLED]],
  [PseudoState.FOCUS, [FocusState.FOCUSED, FocusState.POINTER_FOCUSED]],
  [PseudoState.FOCUS_VISIBLE, [FocusState.FOCUSED]]
]);

/** The template part of the Button family whose brushes its visual states set, by its name and its type. */
const CONTENT_PRESENTER = "content-presenter";

const COMMON_ONLY: ReadonlySet<string> = new Set(Object.values(CommonState));

/**
 * The controls whose template this drives, with the states each defines (read
 * from WinUI's generic.xaml): the Button family has the four `CommonStates`
 * and no `FocusStates`, so `:focus` on one stays a Style setter.
 */
const TEMPLATE_STATES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ["button", COMMON_ONLY],
  ["repeat-button", COMMON_ONLY],
  ["hyperlink-button", COMMON_ONLY],
  ["drop-down-button", COMMON_ONLY]
]);

/** What the runtime does with the rules of a templated control that has state rules. */
interface VisualStatePlan {
  /** The type of the template part the states change, which is also its name (`content-presenter`). */
  part: string;
  /** The rules for the Style route, without the declarations handed to the template. */
  rest: RankedRule[];
  /** The rules of each visual state, with only the declarations the template's states take. */
  states: Map<string, RankedRule[]>;
}

function targetsOf({ state, available }: {
  state: PseudoState | null;
  available: ReadonlySet<string>;
}) {
  const targets = state === null ? undefined : STATE_TARGETS.get(state);
  const isDriven = targets !== undefined && targets.every(target => available.has(target));
  return isDriven ? targets : [];
}

function withDeclarations({ ranked, declarations }: {
  ranked: RankedRule;
  declarations: RankedRule["rule"]["declarations"];
}) {
  return {
    ...ranked,
    rule: {
      ...ranked.rule,
      declarations
    }
  };
}

/**
 * Splits the rules that match a control by where they go: a `:hover`,
 * `:active` or `:disabled` rule's brushes to the visual states of the control's
 * template, everything else to its Style. Null for a control whose template is
 * not driven.
 */
export function planVisualStates({ elementType, rules }: {
  elementType: string;
  rules: readonly RankedRule[];
}) {
  const available = TEMPLATE_STATES.get(elementType);
  const isDriven = available !== undefined;
  if (!isDriven) {
    return null;
  }

  const plan: VisualStatePlan = {
    part: CONTENT_PRESENTER,
    rest: [],
    states: new Map()
  };
  for (const ranked of rules) {
    const { state, declarations } = ranked.rule;
    const targets = targetsOf({
      state,
      available
    });
    const isKept = targets.length === 0;
    if (isKept) {
      plan.rest.push(ranked);
      continue;
    }

    const diverted = declarations.filter(({ property }) => VISUAL_STATE_MEMBERS.includes(property));
    const kept = declarations.filter(({ property }) => !VISUAL_STATE_MEMBERS.includes(property));
    const hasKept = kept.length > 0;
    if (hasKept) {
      plan.rest.push(
        withDeclarations({
          ranked,
          declarations: kept
        })
      );
    }

    const hasDiverted = diverted.length > 0;
    if (!hasDiverted) {
      continue;
    }

    for (const target of targets) {
      plan.states.set(target, [...plan.states.get(target) ?? [], withDeclarations({
        ranked,
        declarations: diverted
      })]);
    }
  }

  return plan;
}
