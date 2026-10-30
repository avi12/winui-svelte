import { formatValidation } from "./diagnostic.ts";
import { winuiPreprocess, WinuiStyleError } from "./preprocess.ts";
import { rule, ruleName } from "./stylelint.ts";
import { validateComponent } from "./validate.ts";
import { vscodeCssData } from "./vscode-data.ts";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { BUILD_GROUPS, LAZY_GROUPS } from "#src/css/translate/lazy-groups.js";
import { propertyGroups } from "#src/css/translate/properties.js";
import { WINUI_ONLY_PROPERTIES } from "#src/css/translate/winui-only-properties.js";
import { winuiCss } from "#src/css/vite.js";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import stylelint from "stylelint";

const resources = loadWinuiCatalogue();
const FOLDER = mkdtempSync(path.join(tmpdir(), "winui-validate-")).replaceAll("\\", "/");

function component(style: string) {
  return `<grid class="a"></grid>\n<style>\n${style}\n</style>\n`;
}

function validate(style: string) {
  return validateComponent({
    source: component(style),
    filename: `${FOLDER}/card.svelte`,
    resources
  });
}

function messages(style: string) {
  return validate(style).map(diagnostic => diagnostic.message);
}

test("a unit WinUI has no meaning for is an error that says what to write", () => {
  const [diagnostic] = validate(".a {\n  width: 2ch;\n}");
  assert.equal(diagnostic?.code, "unsupported-unit");
  assert.match(diagnostic?.message ?? "", /ch has no WinUI equivalent .*WinUI has no ch unit: write px/u);
  assert.equal(diagnostic?.suggestion, "WinUI has no ch unit: write px");
  assert.deepEqual([diagnostic?.start.line, diagnostic?.start.column, diagnostic?.end.column], [4, 9, 12]);
  assert.match(diagnostic?.frame ?? "", /\^\^\^/u);
});

test("the native units are fine", () => {
  assert.deepEqual(messages(".a { width: 10px; transform: rotate(45deg); transition: opacity 100ms; opacity: 0.5 }"), []);
  assert.deepEqual(messages(".a { width: calc(10px + 2 * 4px) }"), []);
});

test("grid tracks: auto, px and fr mix, and repeat(N) expands", () => {
  assert.deepEqual(messages(".a { grid-template-columns: auto 120px 1fr 2fr }"), []);
  assert.deepEqual(messages(".a { grid-template-columns: repeat(3, 1fr) }"), []);
});

test("grid tracks with no WinUI equivalent say what to write", () => {
  assert.deepEqual(messages(".a { grid-template-columns: repeat(auto-fill, 100px) }"), [
    "repeat(auto-fill, ...) has no WinUI equivalent: write explicit tracks, for example repeat(3, 1fr) or 1fr 1fr 1fr"
  ]);
  assert.match(messages(".a { grid-template-rows: subgrid }").join(), /subgrid has no WinUI equivalent/u);
  assert.match(messages(".a { grid-template-rows: masonry }").join(), /masonry has no WinUI equivalent/u);
  assert.match(messages(".a { grid-template-columns: [side] 1fr }").join(), /named line \[side\]/u);
  assert.match(messages(".a { grid-template-columns: 25% 1fr }").join(), /% track 25% has no WinUI equivalent: use fr/u);
  const [partial] = validate(".a { grid-template-columns: min-content 1fr }");
  assert.deepEqual([partial?.severity, partial?.code], ["warning", "partial-support"]);
});

test("a property and an at-rule WinUI lacks are reported with the build's reason", () => {
  const [property] = validate(".a { float: left }");
  assert.equal(property?.code, "unsupported-property");
  assert.match(property?.message ?? "", /float has no WinUI meaning/u);
  const [atRule] = validate("@import url(x.css);");
  assert.equal(atRule?.code, "unsupported-at-rule");
});

test("the -winui-* list is the properties the table handles, and the editor data is derived from it", () => {
  const groups = [
    ...propertyGroups,
    ...LAZY_GROUPS.flatMap(lazy => lazy.groups()),
    ...BUILD_GROUPS.flatMap(build => build())
  ];
  const members = new Set(groups.flatMap(group => group.members));
  const documented = new Set(WINUI_ONLY_PROPERTIES.map(property => property.name));
  assert.equal(documented.has("-winui-based-on"), true);
  for (const name of documented) {
    assert.equal(members.has(name), true, name);
  }

  const handled = [...members].filter(member => member.startsWith("-winui-"));
  assert.deepEqual(handled.sort(), [...documented].sort());

  const file = JSON.parse(readFileSync(new URL("vscode-css-data.json", import.meta.url), "utf8"));
  assert.deepEqual(file, vscodeCssData());
});

// The three channels, one fixture: the same declaration is underlined with the same words.
const FIXTURE = component(".a {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, 100px);\n}");

test("the preprocessor, stylelint and the Vite plugin give the validator's diagnostic", async () => {
  const file = `${FOLDER}/fixture.svelte`;
  writeFileSync(file, FIXTURE);
  const [expected] = validateComponent({
    source: FIXTURE,
    filename: file,
    resources
  });
  assert.ok(expected);

  const preprocessor = winuiPreprocess({ resources });
  const content = FIXTURE.slice(FIXTURE.indexOf("<style>") + "<style>".length, FIXTURE.indexOf("</style>"));
  assert.throws(() => preprocessor.style?.({
    content,
    markup: FIXTURE,
    attributes: {},
    filename: file
  }), (error: unknown) => {
    assert.ok(error instanceof WinuiStyleError);
    assert.equal(error.message, expected.message);
    assert.deepEqual([error.start, error.end, error.frame], [expected.start, expected.end, expected.frame]);
    assert.deepEqual([error.line, error.column], [expected.start.line - 1, expected.start.column]);
    assert.equal(error.code, `winui-svelte/${expected.code}`);
    return true;
  });

  const linted = await stylelint.lint({
    files: file,
    config: {
      customSyntax: "postcss-html",
      plugins: [{
        ruleName,
        rule
      }],
      rules: {
        [ruleName]: true
      }
    }
  });
  const [warning] = linted.results[0]?.warnings ?? [];
  assert.equal(warning?.text.startsWith(expected.message), true);
  assert.deepEqual([warning?.line, warning?.column], [expected.start.line, expected.start.column + 1]);

  const plugin = winuiCss({ root: FOLDER });
  const load = plugin.load;
  assert.equal(typeof load, "function");
  const context = {
    addWatchFile() {},
    warn() {},
    error(message: string) {
      throw new Error(message);
    }
  };
  assert.throws(() => Function.prototype.apply.call(load, context, [`${file}-winui-css.js`]), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(
      error.message.startsWith(
        formatValidation({
          ...expected,
          filename: file
        })
      ), true
    );
    return true;
  });
});

test("a component with no problem passes the preprocessor untouched", () => {
  const preprocessor = winuiPreprocess({ resources });
  const style = ".a { width: 10px }";
  assert.deepEqual(
    preprocessor.style?.({
      content: style,
      markup: component(style),
      attributes: {},
      filename: "ok.svelte"
    }), { code: style }
  );
});
