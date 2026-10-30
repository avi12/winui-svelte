/**
 * What the validator reports, in the shape Svelte's own diagnostics have so
 * the Svelte language server, `svelte-check`, Vite and stylelint all show the
 * same thing: `start` and `end` carry a 1-based `line`, a 0-based `column` and
 * the `character` offset in the file.
 */
export interface ValidationPosition {
  line: number;
  column: number;
  character: number;
}

/** The kinds of problem the validator finds; each is a stylelint rule `winui-svelte/<code>` too. */
export const ValidationCode = {
  UNSUPPORTED_PROPERTY: "unsupported-property",
  UNSUPPORTED_AT_RULE: "unsupported-at-rule",
  UNSUPPORTED_UNIT: "unsupported-unit",
  UNSUPPORTED_GRID_TRACK: "unsupported-grid-track",
  RUNTIME_UNIT: "runtime-unit",
  PARTIAL_SUPPORT: "partial-support",
  INVALID_CSS: "invalid-css"
} as const;

/** One of the codes in `ValidationCode`. */
export type ValidationCode = (typeof ValidationCode)[keyof typeof ValidationCode];

/** A problem in a component's `<style>`, located exactly. */
export interface ValidationDiagnostic {
  code: ValidationCode;
  severity: "error" | "warning";
  message: string;
  filename: string;
  start: ValidationPosition;
  end: ValidationPosition;
  /** The code around the problem with a caret line under it, as Svelte prints one. */
  frame: string;
  /** What to write instead; empty when there is no single answer. */
  suggestion: string;
}

/** The 1-based line and 0-based column of a character offset in `source`. */
export function positionAt({ source, character }: {
  source: string;
  character: number;
}) {
  const before = source.slice(0, character);
  const line = before.split("\n").length;
  return {
    line,
    column: character - (before.lastIndexOf("\n") + 1),
    character
  } satisfies ValidationPosition;
}

const FRAME_CONTEXT = 2;

/** The lines around a range with a caret line under its first line, like Svelte's `frame`. */
export function frameOf({ source, start, end }: {
  source: string;
  start: ValidationPosition;
  end: ValidationPosition;
}) {
  const lines = source.split("\n");
  const first = Math.max(0, start.line - 1 - FRAME_CONTEXT);
  const last = Math.min(lines.length - 1, start.line - 1 + FRAME_CONTEXT);
  const width = String(last + 1).length;
  const output: string[] = [];
  for (let iLine = first; iLine <= last; iLine++) {
    const text = (lines[iLine] ?? "").replaceAll("\t", " ");
    output.push(`${String(iLine + 1).padStart(width)}: ${text}`);
    const isStartLine = iLine === start.line - 1;
    if (isStartLine) {
      const lastColumn = end.line === start.line ? end.column : text.length;
      const length = Math.max(1, lastColumn - start.column);
      output.push(`${" ".repeat(width + 2 + start.column)}${"^".repeat(length)}`);
    }
  }

  return output.join("\n");
}

/** A diagnostic as one line plus its frame: `file:line:column: message [code]`. */
export function formatValidation(diagnostic: ValidationDiagnostic) {
  const { filename, start, message, code, severity, frame } = diagnostic;
  const level = severity === "warning" ? "warning: " : "";
  return `${filename}:${start.line}:${start.column + 1}: ${level}${message} [winui-svelte/${code}]\n${frame}`;
}
