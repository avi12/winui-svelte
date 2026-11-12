// What the inspection reports, and which of it the check fails on. The profile
// (scripts/editor/webstorm/profile.xml) is the one list of what is checked:
// the runner writes one result file per enabled inspection, and only those the
// profile turns on are read.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const PROJECT_DIR_PREFIX = "file://$PROJECT_DIR$/";
// The code the package is written in. A Markdown file's fenced code is
// inspected too, and its snippets are not meant to compile.
const CHECKED_EXTENSIONS = new Set([".ts", ".svelte", ".js", ".mjs"]);
const HTML_TAG_PATTERN = /<[^>]*>/g;
const NUMERIC_ENTITY_PATTERN = /&#(\d+);/g;
const ENABLED_TOOL_PATTERN = /<inspection_tool\s+class="([^"]+)"\s+enabled="true"/g;
const HTML_ENTITIES: Record<string, string> = {
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": "\"",
  "&#39;": "'",
  "&nbsp;": " ",
  "&amp;": "&"
};

const resultFileSchema = z.object({
  problems: z.array(
    z.object({
      file: z.string(),
      line: z.number(),
      offset: z.number(),
      problem_class: z.object({
        id: z.string(),
        severity: z.string()
      }),
      description: z.string()
    })
  )
});

/** One thing the IDE underlines, as the check prints it. */
interface Problem {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly inspection: string;
  readonly severity: string;
  readonly message: string;
}

/** The inspections the profile turns on, in the order it lists them. */
export function enabledInspections(profileXml: string) {
  return [...profileXml.matchAll(ENABLED_TOOL_PATTERN)].flatMap(match => match[1] ?? []);
}

function plainText(html: string) {
  let text = html
    .replace(HTML_TAG_PATTERN, "")
    .replace(NUMERIC_ENTITY_PATTERN, (_entity, code: string) => String.fromCodePoint(Number(code)));
  for (const [entity, character] of Object.entries(HTML_ENTITIES)) {
    text = text.replaceAll(entity, character);
  }

  return text.trim();
}

function problemsOf({ file, inspection }: {
  file: string;
  inspection: string;
}) {
  if (!existsSync(file)) {
    return [];
  }

  const parsed = resultFileSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) {
    throw new Error(`${inspection}: the result file is not the shape the runner writes: ${parsed.error.message}`);
  }

  return parsed.data.problems.map(problem => ({
    file: problem.file.replace(PROJECT_DIR_PREFIX, ""),
    line: problem.line,
    column: problem.offset + 1,
    inspection: problem.problem_class.id,
    severity: problem.problem_class.severity,
    message: plainText(problem.description)
  }) satisfies Problem);
}

/**
 * Every problem the profile's inspections reported, sorted by file and line.
 * An inspection with nothing to report writes no file, which is read as none.
 */
export function readProblems({ resultsFolder, inspections }: {
  resultsFolder: string;
  inspections: string[];
}) {
  return inspections
    .flatMap(inspection => problemsOf({
      file: path.join(resultsFolder, `${inspection}.json`),
      inspection
    }))
    .filter(problem => CHECKED_EXTENSIONS.has(path.extname(problem.file)))
    .toSorted((first, second) => first.file.localeCompare(second.file) || first.line - second.line);
}
