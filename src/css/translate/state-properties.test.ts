import type { RankedRule } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { CommonState, FocusState, planVisualStates, STATE_TARGETS } from "./state-properties.ts";
import { translateStyleSheet } from "./translate.ts";
import { PseudoState } from "./types.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function rankedRules(css: string) {
  const { sheet } = translateStyleSheet({
    file: "t.svelte",
    css,
    resources
  });
  return sheet.rules.map(rule => ({
    rule,
    id: `t#${rule.order}`,
    rank: rule.order
  } satisfies RankedRule));
}

function propertiesOf(rules: readonly RankedRule[] | undefined) {
  return rules?.flatMap(({ rule }) => rule.declarations.map(({ property }) => property));
}

test("each pseudo-class names the WinUI visual states it is", () => {
  assert.deepEqual(STATE_TARGETS.get(PseudoState.HOVER), [CommonState.POINTER_OVER]);
  assert.deepEqual(STATE_TARGETS.get(PseudoState.ACTIVE), [CommonState.PRESSED]);
  assert.deepEqual(STATE_TARGETS.get(PseudoState.DISABLED), [CommonState.DISABLED]);
  assert.deepEqual(STATE_TARGETS.get(PseudoState.FOCUS), [FocusState.FOCUSED, FocusState.POINTER_FOCUSED]);
  assert.deepEqual(STATE_TARGETS.get(PseudoState.FOCUS_VISIBLE), [FocusState.FOCUSED]);
  assert.equal(STATE_TARGETS.has(PseudoState.CHECKED), false);
});

test("a Button's brushes in a state rule go to the state, its other properties stay", () => {
  const plan = planVisualStates({
    elementType: "button",
    rules: rankedRules(".a { color: red } .a:hover { background-color: #abc; opacity: 0.5 } .a:disabled { color: gray }")
  });
  assert.deepEqual(propertiesOf(plan?.rest), ["color", "opacity"]);
  assert.deepEqual([...plan?.states.keys() ?? []], [CommonState.POINTER_OVER, CommonState.DISABLED]);
  assert.deepEqual(propertiesOf(plan?.states.get(CommonState.POINTER_OVER)), ["background-color"]);
});

test("a state the template has no group for, :checked, and a control that is not driven stay as they are", () => {
  const css = ".a:focus { color: red } .a:checked { color: blue }";
  const button = planVisualStates({
    elementType: "button",
    rules: rankedRules(css)
  });
  assert.equal(button?.states.size, 0);
  assert.deepEqual(propertiesOf(button?.rest), ["color", "color"]);
  assert.equal(
    planVisualStates({
      elementType: "border",
      rules: rankedRules(css)
    }), null
  );
});
