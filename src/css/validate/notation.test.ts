import { validateComponent } from "./validate.ts";
import { NOTATIONS } from "#src/css/parse/notation.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import stylelint from "stylelint";

const resources = loadWinuiCatalogue();
const CONFIG_PATH = new URL("../../../.stylelintrc.json", import.meta.url);
const CONFIG: unknown = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
const NOTATION_RULES: readonly string[] = Object.values(NOTATIONS).map(({ stylelintRule }) => stylelintRule);
const PROBE_FILE = "probe.svelte";

interface Form {
  name: string;
  rule: string;
  css: string;
  isAccepted: boolean;
}

const FORMS: readonly Form[] = [
  {
    name: "opacity as a number",
    rule: "alpha",
    css: ".a {\n  opacity: 0.5;\n}",
    isAccepted: true
  },
  {
    name: "opacity as a percentage",
    rule: "alpha",
    css: ".a {\n  opacity: 50%;\n}",
    isAccepted: false
  },
  {
    name: "alpha as a number",
    rule: "alpha",
    css: ".a {\n  color: rgb(0 0 0 / 0.5);\n}",
    isAccepted: true
  },
  {
    name: "alpha as a percentage",
    rule: "alpha",
    css: ".a {\n  color: rgb(0 0 0 / 50%);\n}",
    isAccepted: false
  },
  {
    name: "oklch lightness as a number",
    rule: "lightness",
    css: ".a {\n  color: oklch(0.7 0.15 200deg);\n}",
    isAccepted: true
  },
  {
    name: "oklch lightness as a percentage",
    rule: "lightness",
    css: ".a {\n  color: oklch(70% 0.15 200deg);\n}",
    isAccepted: false
  },
  {
    name: "lab lightness as a percentage",
    rule: "lightness",
    css: ".a {\n  color: lab(70% 10 10);\n}",
    isAccepted: false
  },
  {
    name: "keyframes of from and to",
    rule: "keyframeSelector",
    css: "@keyframes fade-in {\n  from {\n    opacity: 0;\n  }\n\n  to {\n    opacity: 1;\n  }\n}",
    isAccepted: true
  },
  {
    name: "keyframes of percentages",
    rule: "keyframeSelector",
    css: "@keyframes fade-in {\n  0% {\n    opacity: 0;\n  }\n\n  100% {\n    opacity: 1;\n  }\n}",
    isAccepted: true
  }
];

function component(css: string) {
  return `<text-block class="a"></text-block>\n<style>\n${css}\n</style>\n`;
}

function configuredRules() {
  const hasRules = typeof CONFIG === "object" && CONFIG !== null && "rules" in CONFIG;
  const rules: unknown = hasRules ? CONFIG.rules : {};
  const isRecord = typeof rules === "object" && rules !== null;
  const entries = isRecord ? Object.entries(rules) : [];
  return Object.fromEntries(entries.filter(([name]) => NOTATION_RULES.includes(name)));
}

async function stylelintFlags(css: string) {
  const outcome = await stylelint.lint({
    code: component(css),
    codeFilename: PROBE_FILE,
    config: {
      customSyntax: "postcss-html",
      rules: configuredRules()
    }
  });
  return (outcome.results[0]?.warnings ?? []).some(({ rule }) => NOTATION_RULES.includes(rule));
}

function compilerRejects(css: string) {
  return validateComponent({
    source: component(css),
    filename: `C:/project/${PROBE_FILE}`,
    resources
  }).some(({ severity }) => severity === "error");
}

test(".stylelintrc.json carries each notation of the table", () => {
  const rules = configuredRules();
  for (const { stylelintRule, stylelintValue } of Object.values(NOTATIONS)) {
    const setting = rules[stylelintRule];
    const value = Array.isArray(setting) ? setting[0] : setting;
    assert.equal(value, stylelintValue, stylelintRule);
  }
});

for (const { name, css, isAccepted } of FORMS) {
  test(`${name}: stylelint and the compiler agree`, async () => {
    assert.equal(await stylelintFlags(css), !isAccepted, "stylelint");
    assert.equal(compilerRejects(css), !isAccepted, "compiler");
  });
}
