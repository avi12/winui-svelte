import { positionAt } from "./diagnostic.ts";
import type { ValidationDiagnostic } from "./diagnostic.ts";
import { validateComponent } from "./validate.ts";
import { withScopedInstances } from "#src/css/relational/scope.js";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { unusedSelectorMessages } from "#src/css/runtime/sheet-module.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import type { PreprocessorGroup, Warning } from "svelte/compiler";

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
  /**
   * Where each component's unused-selector messages are kept for
   * `winuiWarningFilter`; `winuiDiagnostics` makes the pair.
   */
  unusedSelectors?: Map<string, readonly string[]>;
}

const UNUSED_SELECTOR = "css_unused_selector";

/**
 * The Svelte preprocessor that makes WinUI's CSS dialect a language the
 * editor knows: put it first in `preprocess` of `svelte.config.js`, and the
 * Svelte language server marks the exact declaration WinUI cannot say,
 * and `svelte-check` prints it with the same message the build gives. It
 * reports the first error (fix it and the next shows); warnings are for
 * stylelint and the build. Its `markup` hook lowers `style:` and `class:`
 * directives on component instances to `style` and `class` attributes, as the
 * build does, because Svelte's plain compiler refuses a directive on a
 * component (`component_invalid_directive`); the editor reads that copy, the
 * file on disk is untouched.
 *
 *   preprocess: [winuiPreprocess(), vitePreprocess()]
 */
export function winuiPreprocess(options: WinuiPreprocessOptions = {}) {
  const resources = options.resources ?? loadWinuiCatalogue();
  const written = new Map<string, string>();
  return {
    name: PREPROCESSOR_NAME,
    markup({ content, filename }) {
      written.set(filename ?? "component.svelte", content);
      return {
        code: withScopedInstances({
          source: content
        })
      };
    },
    style({ content, markup: lowered, filename }) {
      const markup = written.get(filename ?? "component.svelte") ?? lowered;
      options.unusedSelectors?.set(
        filename ?? "component.svelte", unusedSelectorMessages({
          source: markup,
          filename: filename ?? "component.svelte"
        })
      );
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

/**
 * The `warningFilter` that drops Svelte's `css_unused_selector` for a rule
 * that matches a component instance (`.title` for `<TextBlock class="title">`),
 * which the plain compiler of `svelte-check` and the editor reads as an
 * element-less rule; a rule that matches nothing, instances included, still
 * warns. Pass the `unusedSelectors` the preprocessor of the same pair fills.
 */
export function winuiWarningFilter(unusedSelectors: ReadonlyMap<string, readonly string[]>) {
  // Svelte keeps global state while it compiles, so nothing here may compile.
  return ({ code, message, filename }: Warning) => {
    const messages = filename === undefined ? undefined : unusedSelectors.get(filename);
    const isUnknown = code !== UNUSED_SELECTOR || messages === undefined;
    if (isUnknown) {
      return true;
    }

    return messages.includes(message);
  };
}

/**
 * The two halves of the editor setup, sharing what they need: the preprocessor
 * (WinUI CSS errors in the editor) and the `warningFilter` (no false unused
 * selector for a component instance). One call in `svelte.config.js`:
 *
 *   const winui = winuiDiagnostics();
 *   export default {
 *     preprocess: [winui.preprocess, vitePreprocess()],
 *     compilerOptions: { warningFilter: winui.warningFilter }
 *   };
 */
export function winuiDiagnostics(options: Omit<WinuiPreprocessOptions, "unusedSelectors"> = {}) {
  const unusedSelectors = new Map<string, readonly string[]>();
  return {
    preprocess: winuiPreprocess({
      ...options,
      unusedSelectors
    }),
    warningFilter: winuiWarningFilter(unusedSelectors)
  };
}
