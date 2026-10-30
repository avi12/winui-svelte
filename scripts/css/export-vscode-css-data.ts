import { vscodeCssData } from "#src/css/validate/vscode-data.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// Writes src/css/validate/vscode-css-data.json, the VS Code custom data for
// WinUI's CSS dialect, from the tables the translation reads:
//
//   node scripts/css/export-vscode-css-data.ts [--check]
//
// --check writes nothing and fails when the file differs, as the lint gate does.

const OUTPUT_FILE = path.join(import.meta.dirname, "..", "..", "src", "css", "validate", "vscode-css-data.json");
const JSON_INDENT = 2;

const { values } = parseArgs({
  options: {
    check: {
      type: "boolean"
    }
  }
});
const DATA = `${JSON.stringify(vscodeCssData(), null, JSON_INDENT)}\n`;
const IS_CHECK = values.check === true;
if (IS_CHECK) {
  const isCurrent = readFileSync(OUTPUT_FILE, "utf8") === DATA;
  if (!isCurrent) {
    console.error("src/css/validate/vscode-css-data.json is out of date: run pnpm gen:css-data");
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUTPUT_FILE, DATA);
}
