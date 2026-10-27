import { spawnSync } from "node:child_process";
import path from "node:path";

// `pnpm lint:summary`: every linter's violations counted per rule and per
// top-level folder, so a refactor can pick an area and watch its count fall.
//
//   pnpm lint:summary                  all tools
//   pnpm lint:summary eslint tsc       only these (eslint, oxlint, tsc, svelte-check)
//   pnpm lint:summary --folder src/css only the folder's violations, with files

const packageRoot = path.join(import.meta.dirname, "..", "..");
const MAX_OUTPUT_BYTES = 512 * 1024 * 1024;
const TOOL_NAMES = ["eslint", "oxlint", "tsc", "svelte-check"];
const FOLDER_FLAG = "--folder";
const SOURCE_FOLDER = "src";
const FILE_COLUMN_WIDTH = 6;

interface Violation {
  tool: string;
  rule: string;
  file: string;
  line: number;
}

interface SvelteCheckLine {
  type: string;
  filename?: string;
  start?: { line: number };
  code?: string | number;
}

function run(binary: string, argumentList: string[]) {
  const result = spawnSync(process.execPath, [path.join(packageRoot, "node_modules", binary), ...argumentList], {
    cwd: packageRoot,
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES
  });
  return result.stdout;
}

function relativeFile(file: string) {
  return path.relative(packageRoot, file).replaceAll("\\", "/");
}

// `src/<area>` for the package's own code, the first folder for anything else.
function folderOf(file: string) {
  const [first = "", second = ""] = file.split("/");
  const isSource = first === SOURCE_FOLDER && second.includes(".") === false && second !== "";
  return isSource ? `${first}/${second}` : first;
}

// no-restricted-syntax carries many of CLAUDE.md's rules; its message says which.
const SYNTAX_RULE = "no-restricted-syntax";
const SYNTAX_MESSAGE_LENGTH = 70;

function ruleLabel(message: { ruleId: string | null; message: string; fatal?: boolean }) {
  if (message.ruleId === SYNTAX_RULE) {
    return `${SYNTAX_RULE}: ${message.message.slice(0, SYNTAX_MESSAGE_LENGTH)}`;
  }

  return message.ruleId ?? (message.fatal === true ? `parse-error: ${message.message.slice(0, SYNTAX_MESSAGE_LENGTH)}` : "unknown");
}

function eslintViolations() {
  const report: { filePath: string; messages: { ruleId: string | null; message: string; line: number; fatal?: boolean }[] }[] =
    JSON.parse(run("eslint/bin/eslint.js", [".", "--format", "json"]));
  return report.flatMap(entry => entry.messages.map(message => ({
    tool: "eslint",
    rule: ruleLabel(message),
    file: relativeFile(entry.filePath),
    line: message.line
  })));
}

function oxlintViolations() {
  const report: { diagnostics: { code: string; filename: string; labels?: { span: { line: number } }[] }[] } =
    JSON.parse(run("oxlint/bin/oxlint", ["--type-aware", "--format", "json"]));
  return report.diagnostics.map(diagnostic => ({
    tool: "oxlint",
    rule: diagnostic.code,
    file: relativeFile(diagnostic.filename),
    line: diagnostic.labels?.[0]?.span.line ?? 0
  }));
}

function tscViolations() {
  const projects = ["tsconfig.json", "src/css/tsconfig.json"];
  const pattern = /^(.+?)\((\d+),\d+\): error (TS\d+):/u;
  const violations: Violation[] = [];
  for (const project of projects) {
    const output = run("typescript/bin/tsc", ["--noEmit", "--pretty", "false", "-p", project]);
    for (const line of output.split("\n")) {
      const match = pattern.exec(line);
      if (match === null) {
        continue;
      }

      violations.push({
        tool: "tsc",
        rule: match[3] ?? "TS",
        file: relativeFile(path.resolve(packageRoot, match[1] ?? "")),
        line: Number(match[2])
      });
    }
  }
  return violations;
}

function svelteCheckViolations() {
  const output = run("svelte-check/bin/svelte-check", [
    "--tsconfig", "./tsconfig.json", "--output", "machine-verbose"
  ]);
  const violations: Violation[] = [];
  for (const line of output.split("\n")) {
    const jsonStart = line.indexOf("{");
    if (jsonStart < 0) {
      continue;
    }

    const parsed: SvelteCheckLine = JSON.parse(line.slice(jsonStart));
    const isProblem = parsed.type === "ERROR" || parsed.type === "WARNING";
    if (isProblem === false) {
      continue;
    }

    violations.push({
      tool: "svelte-check",
      rule: String(parsed.code ?? "svelte"),
      file: relativeFile(path.resolve(packageRoot, parsed.filename ?? "")),
      line: (parsed.start?.line ?? 0) + 1
    });
  }
  return violations;
}

function countBy(violations: Violation[], key: (violation: Violation) => string) {
  const counts = new Map<string, number>();
  for (const violation of violations) {
    const label = key(violation);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1]);
}

function printTable(title: string, rows: [string, number][]) {
  console.log(`\n${title}`);
  for (const [label, count] of rows) {
    console.log(`${String(count).padStart(FILE_COLUMN_WIDTH)}  ${label}`);
  }
}

function main() {
  const argumentList = process.argv.slice(2);
  const folderIndex = argumentList.indexOf(FOLDER_FLAG);
  const folder = folderIndex < 0 ? undefined : argumentList[folderIndex + 1];
  const requested = argumentList.filter(argument => TOOL_NAMES.includes(argument));
  const tools = requested.length === 0 ? TOOL_NAMES : requested;
  const runners: Record<string, () => Violation[]> = {
    eslint: eslintViolations,
    oxlint: oxlintViolations,
    tsc: tscViolations,
    "svelte-check": svelteCheckViolations
  };

  let violations: Violation[] = [];
  for (const tool of tools) {
    violations = violations.concat(runners[tool]?.() ?? []);
  }

  if (folder !== undefined) {
    const inFolder = violations.filter(violation => violation.file.startsWith(folder));
    printTable(`${folder}: by rule`, countBy(inFolder, violation => `${violation.tool}  ${violation.rule}`));
    printTable(`${folder}: by file`, countBy(inFolder, violation => violation.file));
    return;
  }

  printTable("By rule", countBy(violations, violation => `${violation.tool}  ${violation.rule}`));
  printTable("By folder", countBy(violations, violation => folderOf(violation.file)));
  printTable("By tool", countBy(violations, violation => violation.tool));
  console.log(`\nTotal: ${violations.length}`);
}

main();
