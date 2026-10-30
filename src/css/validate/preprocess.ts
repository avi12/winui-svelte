import { positionAt } from "./diagnostic.ts";
import type { ValidationDiagnostic } from "./diagnostic.ts";
import { validateComponent } from "./validate.ts";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import type { PreprocessorGroup } from "svelte/compiler";

const PREPROCESSOR_NAME = "winui-svelte";

/**
 * The error the preprocessor throws for a style WinUI cannot say. It has the
 * fields of a Svelte compile error (`code`, `start`, `end`, `frame`,
 * `filename`), which is what the Svelte language server underlines and
 * `svelte-check` prints.
 */
export class WinuiStyleError extends Error {
  readonly code: string;
  readonly filename: string;
  readonly start: ValidationDiagnostic["start"];
  readonly end: ValidationDiagnostic["end"];
  readonly frame: string;
  readonly suggestion: string;
  /** The line counted from the first line of the `<style>` content (1-based), which the language server reads. */
  readonly line: number;
  /** The column of the error in its line of the file (0-based). */
  readonly column: number;
  /** What the language server shows: the message alone, as every other channel words it. */
  readonly formatted: string;

  constructor({ diagnostic, contentLine }: {
    diagnostic: ValidationDiagnostic;
    contentLine: number;
  }) {
    super(diagnostic.message);
    this.name = "WinuiStyleError";
    this.code = `winui-svelte/${diagnostic.code}`;
    this.filename = diagnostic.filename;
    this.start = diagnostic.start;
    this.end = diagnostic.end;
    this.frame = diagnostic.frame;
    this.suggestion = diagnostic.suggestion;
    this.line = diagnostic.start.line - contentLine + 1;
    this.column = diagnostic.start.column;
    this.formatted = diagnostic.message;
  }
}

/** Options of the preprocessor. */
export interface WinuiPreprocessOptions {
  /** The catalogue of WinUI's resources `var(--name)` is checked against; default the packaged one. */
  resources?: ResourceCatalogue;
}

/**
 * The Svelte preprocessor that makes WinUI's CSS dialect a language the
 * editor knows: put it first in `preprocess` of `svelte.config.js`, and the
 * Svelte language server marks the exact declaration WinUI cannot say,
 * and `svelte-check` prints it with the same message the build gives. It
 * reports the first error (fix it and the next shows); warnings are for
 * stylelint and the build. It never changes the source.
 *
 *   preprocess: [winuiPreprocess(), vitePreprocess()]
 */
export function winuiPreprocess(options: WinuiPreprocessOptions = {}) {
  const resources = options.resources ?? loadWinuiCatalogue();
  return {
    name: PREPROCESSOR_NAME,
    style({ content, markup, filename }) {
      const diagnostics = validateComponent({
        source: markup,
        filename: filename ?? "component.svelte",
        resources
      });
      const first = diagnostics.find(diagnostic => diagnostic.severity === "error");
      const hasError = first !== undefined;
      if (hasError) {
        throw new WinuiStyleError({
          diagnostic: first,
          contentLine: positionAt({
            source: markup,
            character: markup.indexOf(content)
          }).line
        });
      }

      return { code: content };
    }
  } satisfies PreprocessorGroup;
}
