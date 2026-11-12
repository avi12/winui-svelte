import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import type { WriteSeam } from "./property-kit.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import { viewTransitionGroups } from "./view-transition-properties.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function lower(declarations: string) {
  const translation = translateStyleSheet({
    file: "t.svelte",
    css: `border.t { ${declarations} }`,
    resources
  });
  const errors = translation.diagnostics.map(formatDiagnostic);
  const [rule] = translation.sheet.rules;
  const isRuleMissing = rule === undefined;
  if (isRuleMissing) {
    return {
      writes: [],
      errors
    };
  }

  const lowered = lowerDeclarations({
    extraGroups: viewTransitionGroups(),
    computed: computeDeclarations({
      matched: [rule],
      inline: []
    }),
    options: {
      elementType: "border",
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report(diagnostic) {
        errors.push(diagnostic.message);
      }
    }
  });
  return {
    writes: lowered.writes.map(({ target, value }) => [target, value]),
    errors
  };
}

test("a view-transition-name is written to the element, not set by a Style", () => {
  assert.deepEqual(lower("view-transition-name: photo-3"), {
    writes: [["view-transition-name", "photo-3"]],
    errors: []
  });
});

test("view-transition-name none names nothing", () => {
  assert.deepEqual(lower("view-transition-name: none").writes, []);
});

test("auto and match-element are build errors that ask for a name", () => {
  for (const keyword of ["auto", "match-element"]) {
    const { writes, errors } = lower(`view-transition-name: ${keyword}`);
    assert.deepEqual(writes, []);
    assert.match(errors.join("\n"), /give each element a name of its own/u);
  }
});

test("a value that is not one name is a build error", () => {
  const { writes, errors } = lower("view-transition-name: hero card");
  assert.deepEqual(writes, []);
  assert.match(errors.join("\n"), /expected a single value/u);
});

test("the write names the control through the host, and its undo takes the name away", () => {
  const named = new Map<object, string>();
  const [group] = viewTransitionGroups({
    name({ control, name }) {
      named.set(control, name);
      return () => named.delete(control);
    }
  });
  const control = {};
  const handler = group?.writes["view-transition-name"];
  const undo = handler?.({
    control,
    value: "hero",
    native: {} as unknown as WriteSeam,
    refreshText() {}
  });
  assert.equal(named.get(control), "hero");
  undo?.();
  assert.equal(named.has(control), false);
});
