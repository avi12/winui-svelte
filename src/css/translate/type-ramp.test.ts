import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function lowerRule(declarations: string) {
  const translation = translateStyleSheet({
    file: "t.svelte",
    css: `.t { ${declarations} }`,
    resources
  });
  const errors: string[] = translation.diagnostics.map(formatDiagnostic);
  const [rule] = translation.sheet.rules;
  if (!rule) {
    return {
      setters: [],
      errors
    };
  }

  const lowered = lowerDeclarations({
    computed: computeDeclarations({
      matched: [rule],
      inline: []
    }),
    options: {
      elementType: null,
      resolveVariable: resolveBuiltVariable,
      hasStyle: () => true,
      report: ({ message }) => errors.push(message)
    }
  });
  return {
    setters: lowered.setters.map(entry => [entry.property, entry.kind === "setter" ? entry.value : entry.xaml]),
    errors
  };
}

test("font: var(--type-title) is the size resource and weight of the Title step", () => {
  const result = lowerRule("font: var(--type-title)");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters, [["FontSize", "{ThemeResource TitleTextBlockFontSize}"], ["FontWeight", "SemiBold"]]);
});

test("font: var(--type-caption) is regular", () => {
  const result = lowerRule("font: var(--type-caption)");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters, [["FontSize", "{ThemeResource CaptionTextBlockFontSize}"], ["FontWeight", "Normal"]]);
});

test("a step the ramp does not have lists the ones it does", () => {
  assert.match(lowerRule("font: var(--type-huge)").errors.join(), /not a step of WinUI's type ramp; write one of var\(--type-caption\)/u);
});

test("the font shorthand still expands as before", () => {
  const result = lowerRule("font: italic bold 16px Georgia");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters, [["FontSize", "16"], ["FontWeight", "Bold"], ["FontFamily", "Georgia"], ["FontStyle", "Italic"]]);
});
