import { typeAwareEnvironment } from "./type-aware-environment.ts";
import { spawnSync } from "node:child_process";
import path from "node:path";

// `pnpm lint:summary`: every linter's violations counted per rule and per
// top-level folder, so a refactor can pick an area and watch its count fall.
//
//   pnpm lint:summary                  all tools
//   pnpm lint:summary eslint tsc       only these (eslint, oxlint, tsc, svelte-check)
//   pnpm lint:summary --folder src/css only the folder's violations, with files

const PACKAGE_ROOT = path.join(import.meta.dirname, "..", "..");
const BYTES_PER_KILOBYTE = 1024;
const OUTPUT_LIMIT_MEGABYTES = 512;
const MAX_OUTPUT_BYTES = OUTPUT_LIMIT_MEGABYTES * BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE;
const TOOL_NAMES = ["eslint", "oxlint", "tsc", "svelte-check"];
const FOLDER_FLAG = "--folder";
const SOURCE_FOLDER = "src";
const COUNT_COLUMN_WIDTH = 6;
const TSC_PROJECTS = ["tsconfig.json", "src/css/tsconfig.json"];
const TSC_ERROR_LINE = /^(.+?)\((\d+),\d+\): error (TS\d+):/u;
const SYNTAX_RULE = "no-restricted-syntax";
const SYNTAX_MESSAGE_LENGTH = 70;
const SVELTE_CHECK_LINE_BASE = 1;
const TSC_CODE_GROUP = 3;
const TSC_FILE_GROUP = 1;
const TSC_LINE_GROUP = 2;

interface Violation {
  tool: string;
  rule: string;
  file: string;
  line: number;
}

interface EslintMessage {
  ruleId: string | null;
  message: string;
  line: number;
  fatal?: boolean;
}

interface EslintFile {
  filePath: string;
  messages: EslintMessage[];
}

interface OxlintDiagnostic {
  code: string;
  filename: string;
  labels?: Array<{
    span: { line: number };
  }>;
}

interface SvelteCheckLine {
  type: string;
  filename?: string;
  start?: { line: number };
  code?: string | number;
}

interface Counted {
  label: string;
  count: number;
}

function run({ binary, argumentList, environment = process.env }: {
  binary: string;
  argumentList: string[];
  environment?: NodeJS.ProcessEnv;
}) {
  const script = path.join(PACKAGE_ROOT, "node_modules", binary);
  const result = spawnSync(process.execPath, [script, ...argumentList], {
    cwd: PACKAGE_ROOT,
    env: environment,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES
  });
  return result.stdout;
}

function relativeFile(file: string) {
  return path.relative(PACKAGE_ROOT, file).replaceAll("\\", "/");
}

// `src/<area>` for the package's own code, the first folder for anything else.
function folderOf(file: string) {
  const [first = "", second = ""] = file.split("/");
  const isAreaFolder = first === SOURCE_FOLDER && second !== "" && !second.includes(".");
  return isAreaFolder ? `${first}/${second}` : first;
}

// no-restricted-syntax carries many of CLAUDE.md's rules; its message says which.
function eslintRuleLabel(message: EslintMessage) {
  const text = message.message.slice(0, SYNTAX_MESSAGE_LENGTH);
  const rule = message.ruleId;
  const isSyntaxRule = rule === SYNTAX_RULE;
  if (isSyntaxRule) {
    return `${SYNTAX_RULE}: ${text}`;
  }

  const isWithoutRule = rule === null;
  if (isWithoutRule) {
    return message.fatal === true ? `parse-error: ${text}` : "unknown";
  }

  return rule;
}

function eslintViolations() {
  const output = run({
    binary: "eslint/bin/eslint.js",
    argumentList: [".", "--format", "json"]
  });
  const report: EslintFile[] = JSON.parse(output);
  return report.flatMap(entry => entry.messages.map(message => ({
    tool: "eslint",
    rule: eslintRuleLabel(message),
    file: relativeFile(entry.filePath),
    line: message.line
  })));
}

function oxlintViolations() {
  const output = run({
    binary: "oxlint/bin/oxlint",
    argumentList: ["--type-aware", "--format", "json"],
    environment: typeAwareEnvironment()
  });
  const report: { diagnostics: OxlintDiagnostic[] } = JSON.parse(output);
  return report.diagnostics.map(diagnostic => ({
    tool: "oxlint",
    rule: diagnostic.code,
    file: relativeFile(diagnostic.filename),
    line: diagnostic.labels?.[0]?.span.line ?? 0
  }));
}

function tscViolations() {
  const violations: Violation[] = [];
  for (const project of TSC_PROJECTS) {
    const output = run({
      binary: "typescript/bin/tsc",
      argumentList: ["--noEmit", "--pretty", "false", "-p", project]
    });
    for (const line of output.split("\n")) {
      const match = TSC_ERROR_LINE.exec(line);
      const isOtherLine = match === null;
      if (isOtherLine) {
        continue;
      }

      violations.push({
        tool: "tsc",
        rule: match[TSC_CODE_GROUP] ?? "TS",
        file: relativeFile(path.resolve(PACKAGE_ROOT, match[TSC_FILE_GROUP] ?? "")),
        line: Number(match[TSC_LINE_GROUP])
      });
    }
  }
  return violations;
}

function svelteCheckViolations() {
  const output = run({
    binary: "svelte-check/bin/svelte-check",
    argumentList: ["--tsconfig", "./tsconfig.json", "--output", "machine-verbose"]
  });
  const violations: Violation[] = [];
  for (const line of output.split("\n")) {
    const jsonStart = line.indexOf("{");
    const isNotJson = jsonStart < 0;
    if (isNotJson) {
      continue;
    }

    const parsed: SvelteCheckLine = JSON.parse(line.slice(jsonStart));
    const isProblem = parsed.type === "ERROR" || parsed.type === "WARNING";
    if (!isProblem) {
      continue;
    }

    violations.push({
      tool: "svelte-check",
      rule: String(parsed.code ?? "svelte"),
      file: relativeFile(path.resolve(PACKAGE_ROOT, parsed.filename ?? "")),
      line: (parsed.start?.line ?? 0) + SVELTE_CHECK_LINE_BASE
    });
  }
  return violations;
}

const RUNNERS: Record<string, () => Violation[]> = {
  eslint: eslintViolations,
  oxlint: oxlintViolations,
  tsc: tscViolations,
  "svelte-check": svelteCheckViolations
};

function countBy({ violations, labelOf }: {
  violations: Violation[];
  labelOf: (violation: Violation) => string;
}) {
  const counts = new Map<string, number>();
  for (const violation of violations) {
    const label = labelOf(violation);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const counted: Counted[] = [...counts].map(([label, count]) => ({
    label,
    count
  }));
  return counted.sort((left, right) => right.count - left.count);
}

function printTable({ title, rows }: {
  title: string;
  rows: Counted[];
}) {
  console.log(`\n${title}`);
  for (const row of rows) {
    console.log(`${String(row.count).padStart(COUNT_COLUMN_WIDTH)}  ${row.label}`);
  }
}

function printFolder({ folder, violations }: {
  folder: string;
  violations: Violation[];
}) {
  const inFolder = violations.filter(violation => violation.file.startsWith(folder));
  printTable({
    title: `${folder}: by rule`,
    rows: countBy({
      violations: inFolder,
      labelOf: violation => `${violation.tool}  ${violation.rule}`
    })
  });
  printTable({
    title: `${folder}: by file`,
    rows: countBy({
      violations: inFolder,
      labelOf: violation => violation.file
    })
  });
}

function main() {
  const argumentList = process.argv.slice(2);
  const folderIndex = argumentList.indexOf(FOLDER_FLAG);
  const folder = folderIndex < 0 ? undefined : argumentList[folderIndex + 1];
  const requested = argumentList.filter(argument => TOOL_NAMES.includes(argument));
  const tools = requested.length === 0 ? TOOL_NAMES : requested;

  let violations: Violation[] = [];
  for (const tool of tools) {
    violations = violations.concat(RUNNERS[tool]?.() ?? []);
  }

  const isOneFolder = folder !== undefined;
  if (isOneFolder) {
    printFolder({
      folder,
      violations
    });
    return;
  }

  printTable({
    title: "By rule",
    rows: countBy({
      violations,
      labelOf: violation => `${violation.tool}  ${violation.rule}`
    })
  });
  printTable({
    title: "By folder",
    rows: countBy({
      violations,
      labelOf: violation => folderOf(violation.file)
    })
  });
  printTable({
    title: "By tool",
    rows: countBy({
      violations,
      labelOf: violation => violation.tool
    })
  });
  console.log(`\nTotal: ${violations.length}`);
}

main();
