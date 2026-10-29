import { Combinator, parseComplexSelector } from "./complex-selector.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("compounds and the combinators between them", () => {
  const parsed = parseComplexSelector("stack-panel.list > .item:nth-child(2n+1) + .b ~ .c .d");
  assert.ok(parsed.isValid);
  assert.deepEqual(parsed.compounds.map(compound => compound.combinator), [
    null,
    Combinator.CHILD,
    Combinator.NEXT_SIBLING,
    Combinator.LATER_SIBLING,
    Combinator.DESCENDANT
  ]);
  assert.equal(parsed.compounds[0]?.elementType, "stack-panel");
  assert.deepEqual(parsed.compounds[1]?.pseudoClasses, [{
    name: "nth-child",
    argument: "2n+1"
  }]);
});

test("a selector with an id or an attribute cannot be read", () => {
  for (const selector of ["#a", ".a[b]", "a::before"]) {
    assert.equal(parseComplexSelector(selector).isValid, false, selector);
  }
});
