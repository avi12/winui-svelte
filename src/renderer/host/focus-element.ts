import { FocusState } from "#src/winui.js";

/**
 * How focus is said to have arrived, which decides whether WinUI draws the
 * focus visual: `keyboard` shows it, `pointer` does not, and `programmatic`
 * (the default) follows the input device last used.
 */
export const FocusKind = {
  programmatic: "programmatic",
  keyboard: "keyboard",
  pointer: "pointer"
} as const;

/** One of `FocusKind`'s values. */
export type FocusKind = (typeof FocusKind)[keyof typeof FocusKind];

const FOCUS_STATES = {
  [FocusKind.programmatic]: FocusState.Programmatic,
  [FocusKind.keyboard]: FocusState.Keyboard,
  [FocusKind.pointer]: FocusState.Pointer
} as const satisfies Record<FocusKind, FocusState>;

/** What `focusElement` needs of a control: any WinUI `UIElement` has it. */
export interface Focusable {
  focus(state: FocusState): boolean;
}

/**
 * Moves keyboard focus to a control, as `element.focus()` does on the web.
 * Take the control from `elementRef().current` or `@attach control(...)`.
 *
 * @param options - The control to focus, and how focus is said to arrive (`programmatic` when left out).
 * @returns True when the control took focus; false when it cannot (not shown yet, disabled, not focusable).
 */
export function focusElement({ control, state = FocusKind.programmatic }: {
  control: Focusable;
  state?: FocusKind;
}) {
  return control.focus(FOCUS_STATES[state]);
}
