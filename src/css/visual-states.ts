import { fillStates } from "./runtime/visual-state-native.ts";
import { visualStatesWith } from "./runtime/visual-states.ts";
import { provideVisualStates } from "#src/css/runtime/runtime.js";

// The `:hover`, `:active` and `:disabled` rules of a templated control as
// visual states, apart from the entry (index.ts) so a window's bundle carries
// them only when a sheet has such a rule: the module a compiled sheet imports then.

/**
 * Hands the `:hover`, `:active` and `:disabled` brushes of a Button to the
 * visual states of its template. It adds no property: a sheet that has such a
 * rule imports it, and with it the code that fills the states.
 */
export function visualStateGroups() {
  provideVisualStates(visualStatesWith(fillStates));
  return [];
}
