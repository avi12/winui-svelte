import { frameOf, positionAt, ValidationCode } from "./diagnostic.ts";
import type { ValidationDiagnostic } from "./diagnostic.ts";
import { markupDeclarations } from "./markup-declarations.ts";
import type { Located } from "./markup-declarations.ts";
import { BlockKind, parseCss } from "#src/css/parse/parser.js";
import type { Block } from "#src/css/parse/parser.js";
import { matchingParenthesis } from "#src/css/parse/split.js";
import { LENGTH_UNITS, LengthUnitKind } from "#src/css/parse/units.js";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { translateComponent } from "#src/css/runtime/sheet-module.js";
import { GRID_TRACK_PROPERTIES, GRID_TRACK_VERDICTS } from "#src/css/translate/grid-track-verdicts.js";
import type { Diagnostic } from "#src/css/translate/types.js";
import type { CompileOptions } from "svelte/compiler";
import { parse } from "svelte/compiler";

/** What to validate: a `.svelte` file's source. */
export interface ValidateInput {
  source: string;
  /** The component's path, as Svelte is given it. */
  filename: string;
  resources: ResourceCatalogue;
  /** The name the translation gives the sheet; default `filename`. */
  sheetId?: string;
  compilerOptions?: CompileOptions | undefined;
}

interface Finding {
  code: ValidationCode;
  severity: "error" | "warning";
  message: string;
  suggestion: string;
  /** Offsets of the exact text at fault. */
  start: number;
  end: number;
  /** Where the declaration starts, or -1 when the finding is not on one. */
  declarationStart: number;
  /** Kept only when the translation also errored on the declaration: it explains that error. */
  isAdvice?: boolean;
}

const DYNAMIC_FUNCTION = /(?:calc|min|max|clamp)\(/giu;
const NUMBER_WITH_UNIT = /(?<![\w#.-])(-?\d*\.?\d+)([a-z]+|%)(?![\w%-])/giu;
const CONDITION_AT_RULES = new Set(["media", "container", "supports"]);
const NO_MEANING = /has no WinUI meaning/u;
const AT_RULE_MESSAGE = /^@/u;
const DECLARATION_START = /^[\w-]+\s*:/u;
const NOT_NEWLINE = /[^\n]/gu;

function styleRange({ source, filename }: {
  source: string;
  filename: string;
}) {
  const isStylesheet = filename.endsWith(".css");
  if (isStylesheet) {
    return {
      start: 0,
      end: source.length
    };
  }

  try {
    const content = parse(source, { modern: true }).css?.content;
    return content === undefined ? null : {
      start: content.start,
      end: content.end
    };
  } catch {
    return null;
  }
}

function offsetOf({ source, line, column }: {
  source: string;
  line: number;
  column: number;
}) {
  let offset = column - 1;
  for (const text of source.split("\n").slice(0, line - 1)) {
    offset += text.length + 1;
  }

  return offset;
}

// Up to the `;` or `}` that ends a declaration, or the `{` that opens a block.
function declarationEnd({ source, start }: {
  source: string;
  start: number;
}) {
  let depth = 0;
  let end = start;
  while (end < source.length) {
    const character = source[end];
    depth += character === "(" ? 1 : 0;
    depth -= character === ")" ? 1 : 0;
    const isEnd = depth <= 0 && (character === ";" || character === "}" || character === "{");
    if (isEnd) {
      return end;
    }

    end++;
  }

  return end;
}

function declarationsOf({ blocks, source }: {
  blocks: Block[];
  source: string;
}) {
  const located: Located[] = [];
  const pending = [...blocks];
  for (const block of pending) {
    const isRule = block.kind === BlockKind.RULE;
    const declarations = isRule ? block.declarations : [];
    for (const declaration of declarations) {
      const start = offsetOf({
        source,
        line: declaration.at.line,
        column: declaration.at.column
      });
      located.push({
        property: declaration.property,
        value: declaration.value,
        start,
        valueStart: source.indexOf(declaration.value, source.indexOf(":", start) + 1)
      });
    }

    const isConditional = !isRule && CONDITION_AT_RULES.has(block.name);
    if (isConditional) {
      const start = offsetOf({
        source,
        line: block.at.line,
        column: block.at.column
      });
      located.push({
        property: `@${block.name}`,
        value: source.slice(
          start, declarationEnd({
            source,
            start
          })
        ),
        start,
        valueStart: start
      });
    }

    pending.push(...(isRule ? block.nested : block.children ?? []));
  }

  return located;
}

function finding(input: Finding) {
  return input;
}

function diagnosticOf(input: ValidationDiagnostic) {
  return input;
}

// A value with the arguments of calc(), min(), max() and clamp() blanked: a
// unit that only the layout knows is fine there.
function withoutDynamicFunctions(value: string) {
  let masked = value;
  for (const match of value.matchAll(DYNAMIC_FUNCTION)) {
    const open = match.index + match[0].length - 1;
    const end = matchingParenthesis({
      text: masked,
      open
    }) + 1;
    masked = masked.slice(0, match.index) + " ".repeat(end - match.index) + masked.slice(end);
  }

  return masked;
}

const PERCENT = "%";

// What to say about one number with a unit, or null when WinUI reads it as it is written.
function verdictOf({ unit, isInsideMath }: {
  unit: string;
  isInsideMath: boolean;
}) {
  const verdict = LENGTH_UNITS.get(unit);
  const isUnknown = verdict === undefined;
  if (isUnknown) {
    return {
      message: `the unit ${unit} is not a CSS unit WinUI knows`,
      suggestion: "write px, deg, s, ms or fr"
    };
  }

  const isNative = verdict.kind === LengthUnitKind.NATIVE;
  const isPlainPercent = unit === PERCENT && !isInsideMath;
  const isAccepted = isNative || isPlainPercent;
  if (isAccepted) {
    return null;
  }

  return {
    message: `the unit ${unit} has no WinUI equivalent (${verdict.reason ?? ""}): ${verdict.advice ?? ""}`,
    suggestion: verdict.advice ?? ""
  };
}

function unitFindings(located: Located) {
  const findings: Finding[] = [];
  const masked = withoutDynamicFunctions(located.value);
  for (const match of located.value.matchAll(NUMBER_WITH_UNIT)) {
    const unit = (match[2] ?? "").toLowerCase();
    const isInsideMath = masked.slice(match.index, match.index + match[0].length).trim() === "";
    const verdict = verdictOf({
      unit,
      isInsideMath
    });
    const isAccepted = verdict === null;
    if (isAccepted) {
      continue;
    }

    findings.push(
      finding({
        ...verdict,
        start: located.valueStart + match.index,
        end: located.valueStart + match.index + match[0].length,
        declarationStart: located.start,
        code: ValidationCode.UNSUPPORTED_UNIT,
        severity: "error"
      })
    );
  }

  return findings;
}

function gridFindings(located: Located) {
  const isTracks = GRID_TRACK_PROPERTIES.has(located.property);
  if (!isTracks) {
    return [];
  }

  const masked = withoutDynamicFunctions(located.value);
  return GRID_TRACK_VERDICTS.flatMap(verdict => [...masked.matchAll(verdict.pattern)].map(match => finding({
    code: verdict.severity === "warning" ? ValidationCode.PARTIAL_SUPPORT : ValidationCode.UNSUPPORTED_GRID_TRACK,
    severity: verdict.severity,
    message: `${verdict.what(match)} ${verdict.reason}: ${verdict.advice}`,
    suggestion: verdict.advice,
    start: located.valueStart + match.index,
    end: located.valueStart + match.index + match[0].length,
    declarationStart: located.start
  })));
}

function codeOf(message: string) {
  const isAtRule = AT_RULE_MESSAGE.test(message);
  if (isAtRule) {
    return ValidationCode.UNSUPPORTED_AT_RULE;
  }

  return NO_MEANING.test(message) ? ValidationCode.UNSUPPORTED_PROPERTY : ValidationCode.INVALID_CSS;
}

function translated({ diagnostic, source }: {
  diagnostic: Diagnostic;
  source: string;
}) {
  const start = offsetOf({
    source,
    line: diagnostic.at.line,
    column: diagnostic.at.column
  });
  const isDeclaration = DECLARATION_START.test(source.slice(start));
  const end = declarationEnd({
    source,
    start
  });
  return finding({
    code: codeOf(diagnostic.message),
    severity: diagnostic.severity,
    message: diagnostic.message,
    suggestion: "",
    start,
    end: start + source.slice(start, end).trimEnd().length,
    declarationStart: isDeclaration ? start : -1
  });
}

// A component that does not compile is Svelte's to report, with its own error.
function translationOf(input: ValidateInput) {
  try {
    return translateComponent({
      filename: input.filename,
      source: input.source,
      sheetId: input.sheetId ?? input.filename,
      resources: input.resources,
      compilerOptions: input.compilerOptions
    })?.diagnostics ?? [];
  } catch {
    return [];
  }
}

function toDiagnostic({ found, source, filename }: {
  found: Finding;
  source: string;
  filename: string;
}) {
  const start = positionAt({
    source,
    character: found.start
  });
  const end = positionAt({
    source,
    character: found.end
  });
  return diagnosticOf({
    code: found.code,
    severity: found.severity,
    message: found.message,
    filename,
    start,
    end,
    frame: frameOf({
      source,
      start,
      end
    }),
    suggestion: found.suggestion
  });
}

/**
 * Checks a component's `<style>` for everything WinUI cannot say, and says
 * where and what to write instead. This is the one validator: the Svelte
 * preprocessor, the Vite plugin and the stylelint rules all call it, so a
 * hand-coder and an agent get the same message and position through every
 * channel. It runs the build's own translation (so the tables are the same)
 * and adds the explanations the tables hold: unit verdicts and grid tracks.
 */
export function validateComponent(input: ValidateInput) {
  const { source, filename } = input;
  const range = styleRange({
    source,
    filename
  });
  const isStylesheet = filename.endsWith(".css");
  const padded = range === null ? "" : source.slice(0, range.start).replaceAll(NOT_NEWLINE, " ") + source.slice(range.start, range.end);
  const located = [
    ...declarationsOf({
      blocks: range === null ? [] : parseCss(padded),
      source: padded
    }),
    ...isStylesheet ? [] : markupDeclarations(source)
  ];
  const fromTranslation = translationOf(input).map(diagnostic => translated({
    diagnostic,
    source
  }));
  const failedAt = new Set(fromTranslation.filter(item => item.severity === "error").map(item => item.declarationStart));
  const all = located.flatMap(item => [...unitFindings(item), ...gridFindings(item)]);
  const own = all.filter(item => {
    const isExplaining = item.isAdvice === true;
    const isOverlapped = all.some(other => other.isAdvice !== true && other.start < item.end && item.start < other.end);
    const isNeeded = failedAt.has(item.declarationStart) && !isOverlapped;
    return isExplaining ? isNeeded : true;
  });
  const explainedAt = new Set(own.map(item => item.declarationStart));
  const remaining = fromTranslation.filter(item => {
    const isDeclarationExplained = explainedAt.has(item.declarationStart);
    const isRangeExplained = own.some(found => item.start <= found.start && found.end <= item.end);
    return !isDeclarationExplained && !isRangeExplained;
  });
  return [...own, ...remaining]
    .sort((first, second) => first.start - second.start)
    .map(found => toDiagnostic({
      found,
      source,
      filename
    }));
}
