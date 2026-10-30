import { formatValidation } from "./diagnostic.ts";
import { winuiPreprocess, WinuiStyleError } from "./preprocess.ts";
import { rule, ruleName } from "./stylelint.ts";
import { validateComponent } from "./validate.ts";
import { LENGTH_UNITS, LengthUnitKind } from "#src/css/parse/units.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { winuiCss } from "#src/css/vite.js";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import stylelint from "stylelint";

const resources = loadWinuiCatalogue();
const FOLDER = mkdtempSync(path.join(tmpdir(), "winui-units-")).replaceAll("\\", "/");
const UNIT_CODE = "unsupported-unit";
const AMOUNT = "7";
const MATH_POSITION = "a calc() operand";

interface Position {
  name: string;
  /** The component with this length written in the position. */
  source: (length: string) => string;
  /** Whether stylelint (postcss-html) sees the position; false: only the compiler channel does. */
  isLinted: boolean;
}

function inStyle(css: (length: string) => string) {
  return (length: string) => `<grid class="a"></grid>\n<style>\n${css(length)}\n</style>\n`;
}

const POSITIONS: Position[] = [
  {
    name: "a property value",
    source: inStyle(length => `.a {\n  width: ${length};\n}`),
    isLinted: true
  },
  {
    name: "a shorthand",
    source: inStyle(length => `.a {\n  margin: 1px ${length} 2px;\n}`),
    isLinted: true
  },
  {
    name: MATH_POSITION,
    source: inStyle(length => `.a {\n  width: calc(10px + ${length});\n}`),
    isLinted: true
  },
  {
    name: "a grid track",
    source: inStyle(length => `.a {\n  grid-template-columns: ${length} 1fr;\n}`),
    isLinted: true
  },
  {
    name: "a gradient stop",
    source: inStyle(length => `.a {\n  background: linear-gradient(red ${length}, blue);\n}`),
    isLinted: true
  },
  {
    name: "a transform",
    source: inStyle(length => `.a {\n  transform: rotate(${length}) translate(${length});\n}`),
    isLinted: true
  },
  {
    name: "a transition duration",
    source: inStyle(length => `.a {\n  transition: opacity ${length};\n}`),
    isLinted: true
  },
  {
    name: "an animation duration",
    source: inStyle(length => `.a {\n  animation: spin ${length};\n}`),
    isLinted: true
  },
  {
    name: "a media condition",
    source: inStyle(length => `@media (min-width: ${length}) {\n  .a {\n    opacity: 1;\n  }\n}`),
    isLinted: true
  },
  {
    name: "a container condition",
    source: inStyle(length => `@container (min-width: ${length}) {\n  .a {\n    opacity: 1;\n  }\n}`),
    isLinted: true
  },
  {
    name: "a custom property",
    source: inStyle(length => `.a {\n  --gap: ${length};\n  width: var(--gap);\n}`),
    isLinted: true
  },
  {
    name: "an inline style attribute",
    source: length => `<grid style="width: ${length}"></grid>\n`,
    isLinted: true
  },
  {
    name: "a style: directive",
    source: length => `<grid style:width="${length}"></grid>\n`,
    isLinted: false
  }
];

let counter = 0;

function fixture(source: string) {
  const file = `${FOLDER}/fixture-${counter++}.svelte`;
  writeFileSync(file, source);
  return file;
}

function diagnosticsOf(source: string) {
  return validateComponent({
    source,
    filename: fixture(source),
    resources
  });
}

function unitFindings(source: string) {
  return diagnosticsOf(source).filter(diagnostic => diagnostic.code === UNIT_CODE);
}

function lengthFor({ unit, position }: {
  unit: string;
  position: Position;
}) {
  const isPlainPercent = unit === "%" && position.name !== MATH_POSITION;
  return isPlainPercent ? null : `${AMOUNT}${unit}`;
}

test("every unit of the table is judged the same way in every position", () => {
  for (const [unit, verdict] of LENGTH_UNITS) {
    for (const position of POSITIONS) {
      const length = lengthFor({
        unit,
        position
      });
      const isSkipped = length === null;
      if (isSkipped) {
        continue;
      }

      const source = position.source(length);
      const found = unitFindings(source);
      const label = `${unit} in ${position.name}`;
      const isNative = verdict.kind === LengthUnitKind.NATIVE;
      assert.equal(found.length > 0, !isNative, label);
      for (const diagnostic of found) {
        assert.ok(diagnostic.message.startsWith(`the unit ${unit} has no WinUI equivalent`), label);
        assert.ok(length.includes(source.slice(diagnostic.start.character, diagnostic.end.character)), label);
      }
    }
  }
});

test("a unit that is not CSS at all is an error too", () => {
  const [found] = unitFindings(POSITIONS[0]?.source("7furlongs") ?? "");
  assert.equal(found?.message, "the unit furlongs is not a CSS unit WinUI knows");
});

test("each unsupported unit says what to write instead", () => {
  for (const [unit, verdict] of LENGTH_UNITS) {
    const isUnsupported = verdict.kind === LengthUnitKind.UNSUPPORTED;
    if (!isUnsupported) {
      continue;
    }

    const [found] = unitFindings(POSITIONS[2]?.source(`${AMOUNT}${unit}`) ?? "");
    assert.ok(found, unit);
    assert.ok(found.suggestion.startsWith(`WinUI has no ${unit} unit: `), unit);
  }
});

async function lintedWarnings(file: string) {
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
  return linted.results[0]?.warnings ?? [];
}

test("the preprocessor, stylelint and the Vite plugin report the same unit error at the same place", async () => {
  const preprocessor = winuiPreprocess({ resources });
  const plugin = winuiCss({ root: FOLDER });
  const context = {
    addWatchFile() {},
    warn() {},
    error(message: string) {
      throw new Error(message);
    }
  };
  for (const position of POSITIONS) {
    const source = position.source(`${AMOUNT}ch`);
    const file = fixture(source);
    const all = validateComponent({
      source,
      filename: file,
      resources
    });
    const expected = all.filter(diagnostic => diagnostic.code === UNIT_CODE);
    const first = all.find(diagnostic => diagnostic.severity === "error");
    assert.ok(expected.length > 0 && first !== undefined, position.name);

    const hasStyle = source.includes("<style>");
    const content = hasStyle ? source.slice(source.indexOf("<style>") + "<style>".length, source.indexOf("</style>")) : "";
    assert.throws(() => preprocessor.style?.({
      content,
      markup: source,
      attributes: {},
      filename: file
    }), (error: unknown) => {
      assert.ok(error instanceof WinuiStyleError, position.name);
      assert.equal(error.message, first.message, position.name);
      assert.deepEqual([error.start, error.end], [first.start, first.end], position.name);
      return true;
    });

    assert.throws(() => Function.prototype.apply.call(plugin.load, context, [`${file}-winui-css.js`]), (error: unknown) => {
      assert.ok(error instanceof Error, position.name);
      assert.ok(
        error.message.startsWith(
          formatValidation({
            ...first,
            filename: file
          })
        ), position.name
      );
      return true;
    });

    const warnings = await lintedWarnings(file);
    const lintedAt = warnings.map(warning => [warning.text, warning.line, warning.column]);
    const seenByLinter = position.isLinted ? all : [];
    const expectedAt = seenByLinter.map(({ message, start }) => [message, start.line, start.column + 1]);
    const suffix = ` (${ruleName})`;
    const plainAt = lintedAt.map(([text, line, column]) => [String(text).replace(suffix, ""), line, column]);
    assert.deepEqual(plainAt, expectedAt, position.name);
  }
});
