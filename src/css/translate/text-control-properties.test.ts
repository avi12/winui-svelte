import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import { controlGroups } from "./text-control-properties.ts";
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
  const isRuleMissing = rule === undefined;
  if (isRuleMissing) {
    return {
      setters: [],
      errors
    };
  }

  const lowered = lowerDeclarations({
    extraGroups: controlGroups(),
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

const rows: Array<[string, Array<[string, string]>]> = [
  ["font-stretch: ultra-condensed", [["FontStretch", "UltraCondensed"]]],
  ["font-stretch: semi-expanded", [["FontStretch", "SemiExpanded"]]],
  ["font-stretch: normal", [["FontStretch", "Normal"]]],
  ["direction: rtl", [["FlowDirection", "RightToLeft"]]],
  ["justify-content: start", [["HorizontalContentAlignment", "Left"]]],
  ["align-items: end", [["VerticalContentAlignment", "Bottom"]]],
  ["direction: ltr", [["FlowDirection", "LeftToRight"]]],
  ["background-clip: border-box", [["BackgroundSizing", "OuterBorderEdge"]]],
  ["background-clip: padding-box", [["BackgroundSizing", "InnerBorderEdge"]]],
  ["tab-index: 3", [["TabIndex", "3"]]],
  ["tab-index: 0", [["TabIndex", "0"]]],
  ["tab-index: -1", [["IsTabStop", "False"]]]
];

for (const [declarations, expected] of rows) {
  test(declarations, () => {
    const result = lowerRule(declarations);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.setters, expected);
  });
}

test("background-clip: text explains what a WinUI background can clip to", () => {
  assert.match(lowerRule("background-clip: text").errors.join(), /border-box \(OuterBorderEdge\) or padding-box \(InnerBorderEdge\)/u);
});

test("tab-index: 1.5 is not an integer", () => {
  assert.match(lowerRule("tab-index: 1.5").errors.join(), /expected an integer/u);
});

test("font-stretch: wide lists the keywords", () => {
  assert.match(lowerRule("font-stretch: wide").errors.join(), /one of ultra-condensed/u);
});
