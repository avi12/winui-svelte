import { computeDeclarations, resolveBuiltVariable } from "./cascade.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { lowerDeclarations } from "./properties.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import { typographyGroups } from "./typography-properties.ts";
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
    extraGroups: typographyGroups(),
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
  ["font-variant-caps: small-caps", [["Typography.Capitals", "SmallCaps"]]],
  ["font-variant-caps: all-petite-caps", [["Typography.Capitals", "AllPetiteCaps"]]],
  ["font-variant-caps: titling-caps", [["Typography.Capitals", "Titling"]]],
  ["font-variant-caps: normal", [["Typography.Capitals", "Normal"]]],
  ["font-variant-numeric: oldstyle-nums tabular-nums slashed-zero", [
    ["Typography.NumeralStyle", "OldStyle"],
    ["Typography.NumeralAlignment", "Tabular"],
    ["Typography.SlashedZero", "True"]
  ]],
  ["font-variant-numeric: diagonal-fractions", [["Typography.Fraction", "Slashed"]]],
  ["font-variant-numeric: stacked-fractions ordinal", [["Typography.Fraction", "Stacked"], ["Typography.Variants", "Ordinal"]]],
  ["font-variant-position: super", [["Typography.Variants", "Superscript"]]],
  ["font-variant-ligatures: discretionary-ligatures no-contextual", [
    ["Typography.DiscretionaryLigatures", "True"],
    ["Typography.ContextualAlternates", "False"]
  ]],
  ["font-variant-ligatures: none", [
    ["Typography.StandardLigatures", "False"],
    ["Typography.ContextualLigatures", "False"],
    ["Typography.DiscretionaryLigatures", "False"],
    ["Typography.HistoricalLigatures", "False"],
    ["Typography.ContextualAlternates", "False"]
  ]],
  ["font-variant-alternates: historical-forms", [["Typography.HistoricalForms", "True"]]],
  ["font-variant-east-asian: jis04 full-width", [["Typography.EastAsianLanguage", "Jis04"], ["Typography.EastAsianWidths", "Full"]]],
  ["font-kerning: none", [["Typography.Kerning", "False"]]],
  ["font-kerning: auto", [["Typography.Kerning", "True"]]],
  ["font-feature-settings: \"ss01\", \"ss20\" on, \"salt\" 3", [
    ["Typography.StylisticSet1", "True"],
    ["Typography.StylisticSet20", "True"],
    ["Typography.StylisticAlternates", "3"]
  ]],
  ["font-feature-settings: \"smcp\", \"tnum\" 1, \"liga\" 0, \"zero\" off", [
    ["Typography.Capitals", "SmallCaps"],
    ["Typography.NumeralAlignment", "Tabular"],
    ["Typography.StandardLigatures", "False"],
    ["Typography.SlashedZero", "False"]
  ]],
  ["font-feature-settings: \"smcp\" off", [["Typography.Capitals", "Normal"]]],
  ["font-feature-settings: normal", []],
  ["font-optical-sizing: auto", []]
];

for (const [declarations, expected] of rows) {
  test(declarations, () => {
    const result = lowerRule(declarations);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.setters, expected);
  });
}

test("font-variant sets each longhand its words belong to, and the others back to normal", () => {
  const result = lowerRule("font-variant: small-caps oldstyle-nums");
  assert.deepEqual(result.errors, []);
  const setters = new Map(result.setters.map(([property = "", value = ""]) => [property, value]));
  assert.equal(setters.get("Typography.Capitals"), "SmallCaps");
  assert.equal(setters.get("Typography.NumeralStyle"), "OldStyle");
  assert.equal(setters.get("Typography.StandardLigatures"), "True");
  assert.equal(setters.get("Typography.Variants"), "Normal");
});

test("a normal of one longhand does not undo what another sets on the same property", () => {
  const result = lowerRule("font-variant-numeric: normal; font-variant-position: sub");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters.filter(([property]) => property === "Typography.Variants"), [["Typography.Variants", "Subscript"]]);
});

test("font-feature-settings wins over a font-variant keyword, as in CSS", () => {
  const result = lowerRule("font-variant-caps: small-caps; font-feature-settings: \"c2sc\"");
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.setters, [["Typography.Capitals", "AllSmallCaps"]]);
});

test("two longhands that set Typography.Variants differently fail, since WinUI holds one", () => {
  assert.match(lowerRule("font-variant-position: super; font-variant-numeric: ordinal").errors.join(), /already sets Typography\.Variants/u);
});

test("two keywords for one property fail", () => {
  assert.match(lowerRule("font-variant-numeric: lining-nums oldstyle-nums").errors.join(), /sets what another word/u);
});

test("a functional font-variant-alternates says to write the feature instead", () => {
  assert.match(lowerRule("font-variant-alternates: styleset(fancy)").errors.join(), /@font-feature-values.*font-feature-settings/u);
});

test("a feature WinUI has no property for is named in the error", () => {
  assert.match(lowerRule("font-feature-settings: \"cv01\"").errors.join(), /no property for the OpenType feature "cv01"/u);
});

test("an unquoted or malformed feature tag fails", () => {
  assert.match(lowerRule("font-feature-settings: ss01").errors.join(), /quoted four-letter tag/u);
  assert.match(lowerRule("font-feature-settings: \"ss01\" -1").errors.join(), /on, off or a whole number/u);
});

test("font-optical-sizing: none fails, since nothing turns WinUI's off", () => {
  assert.match(lowerRule("font-optical-sizing: none").errors.join(), /optical size/u);
});

test("font-variation-settings has no WinUI meaning, and says why", () => {
  assert.match(lowerRule("font-variation-settings: \"wght\" 600").errors.join(), /font-variation-settings has no WinUI meaning \(WinUI has no API for a variable font's axes/u);
});
