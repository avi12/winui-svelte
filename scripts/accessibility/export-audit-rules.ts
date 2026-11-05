import { ruleDescriptions } from "#src/accessibility/audit/rules.js";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

// Writes src/accessibility/audit/accessibility-rules.json, the table the runtime
// audit checks, without its predicates (id, appliesTo, message, suggestion), for
// an editor extension to show the same diagnostics statically:
//
//   node scripts/accessibility/export-audit-rules.ts [--check]
//
// --check writes nothing and fails when the file differs, as the lint gate does.

const OUTPUT_FILE = path.join(import.meta.dirname, "..", "..", "src", "accessibility", "audit", "accessibility-rules.json");
const JSON_INDENT = 2;

const { values } = parseArgs({
  options: {
    check: {
      type: "boolean"
    }
  }
});
const DATA = `${JSON.stringify(ruleDescriptions(), null, JSON_INDENT)}\n`;
const IS_CHECK = values.check === true;
if (IS_CHECK) {
  const isCurrent = readFileSync(OUTPUT_FILE, "utf8") === DATA;
  if (!isCurrent) {
    console.error("src/accessibility/audit/accessibility-rules.json is out of date: run pnpm gen:accessibility-rules");
    process.exitCode = 1;
  }
} else {
  writeFileSync(OUTPUT_FILE, DATA);
}
