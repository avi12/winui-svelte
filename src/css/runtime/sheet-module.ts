import type { ResourceCatalogue } from "./resources.ts";
import { errorsOf, formatDiagnostic, translateStyleSheet } from "#src/css/translate/translate.js";
import type { Diagnostic, StyleSheetData } from "#src/css/translate/types.js";
import type { CompileOptions } from "svelte/compiler";
import { compile } from "svelte/compiler";

/**
 * Neither a query nor `.svelte.` in the name: vite-plugin-svelte compiles
 * `a.svelte?x` as a component and `a.svelte.x` as a rune module.
 */
export const SHEET_SUFFIX = "-winui-css.js";

const REGISTER_ALIAS = "registerWinuiSheet";

/**
 * A `.svelte` file's `<style>` as the JavaScript module that registers its
 * sheet: Svelte compiles the component (scoping the selectors), the
 * translation turns the CSS it emitted into WinUI Style data, and the module
 * hands that data to the runtime. Node only: it runs in the build.
 */
export interface SheetModuleInput {
  /** The component's path as Svelte was given it (the hash is made from it). */
  filename: string;
  source: string;
  /** A short, stable name for the sheet and for diagnostics (the project-relative path). */
  sheetId: string;
  resources: ResourceCatalogue;
  /** The module that exports registerStyleSheet. */
  runtimeModule: string;
  /**
   * The options the component itself is compiled with; the CSS must come out
   * with the same scoping class, so pass the same ones.
   */
  compilerOptions?: CompileOptions | undefined;
  /** Adds `import.meta.hot.accept()`, so editing the `<style>` re-registers it. */
  isHot?: boolean;
}

/** A sheet's registration module, with the sheet data and the diagnostics it produced. */
export interface SheetModule {
  code: string;
  sheet: StyleSheetData;
  diagnostics: Diagnostic[];
}

/**
 * Svelte's `cssHash` option for the scoping class. Svelte's default depends
 * on its rootDir option; this one only on the file's path, so the
 * component's compile and the sheet's agree.
 */
export function cssHash({ filename, hash }: {
  filename: string;
  hash(text: string): string;
}) {
  return `svelte-${hash(filename.replaceAll("\\", "/"))}`;
}

/** A stylesheet with something WinUI cannot say; the message lists every error, one per line. */
export class SheetError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.filter(diagnostic => diagnostic.severity === "error").map(formatDiagnostic).join("\n"));
    this.diagnostics = diagnostics;
  }
}

// The statements that register a sheet. They name nothing a component might
// (the import is aliased), so they can be appended to a compiled component.
function registrationCode({ sheet, runtimeModule }: {
  sheet: StyleSheetData;
  runtimeModule: string;
}) {
  return [
    `import { registerStyleSheet as ${REGISTER_ALIAS} } from ${JSON.stringify(runtimeModule)};`,
    `${REGISTER_ALIAS}(${JSON.stringify(sheet)});`
  ].join("\n");
}

/**
 * Compiles a component's `<style>` into its registration module; null when
 * the component has no `<style>`. Throws SheetError when the CSS has
 * something WinUI cannot say.
 */
export function compileSheetModule(input: SheetModuleInput) {
  const result = compile(input.source, {
    runes: true,
    ...input.compilerOptions,
    filename: input.filename,
    generate: "client",
    css: "external",
    cssHash
  });
  const css = result.css;
  const hasStyles = css !== null && css.code.trim() !== "";
  if (!hasStyles) {
    return null;
  }

  const translation = translateStyleSheet({
    file: input.sheetId,
    css: css.code,
    map: css.map,
    resources: input.resources
  });
  const hasErrors = errorsOf(translation).length > 0;
  if (hasErrors) {
    throw new SheetError(translation.diagnostics);
  }

  const hot = input.isHot === true ? "\nif (import.meta.hot) {\n  import.meta.hot.accept();\n}" : "";
  return {
    code: `${registrationCode({
      sheet: translation.sheet,
      runtimeModule: input.runtimeModule
    })}${hot}\n`,
    sheet: translation.sheet,
    diagnostics: translation.diagnostics
  };
}
