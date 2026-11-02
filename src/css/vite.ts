import { compileCssFileModule, compileSheetModule, SHEET_SUFFIX, SheetError } from "./runtime/sheet-module.ts";
import { loadWinuiCatalogue } from "./translate/catalogue.ts";
import { formatDiagnostic } from "./translate/translate.ts";
import { formatValidation } from "./validate/diagnostic.ts";
import { markupStyleProperties } from "./validate/markup-declarations.ts";
import { validateComponent } from "./validate/validate.ts";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CompileOptions } from "svelte/compiler";
import type { Plugin } from "vite";

/** Options of the `winuiCss` Vite plugin. */
export interface WinuiCssOptions {
  /** Sheet ids and diagnostics are paths relative to this; default Vite's root. */
  root?: string;
  compilerOptions?: CompileOptions;
  /** The module that exports registerStyleSheet, as the window imports it. */
  runtimeModule?: string;
  /**
   * What a `<style>` WinUI cannot say does: "fail" the load; "report" the
   * line on stderr and register nothing, so an open window stays up (dev); or
   * "report-when-serving", which reports under the dev server and fails a
   * build, so a shipped window never lacks its styles.
   */
  onError?: "fail" | "report" | "report-when-serving";
}

const PLUGIN_NAME = "winui-svelte:css";
const DEFAULT_RUNTIME_MODULE = "winui-svelte/css";
const QUERY_START = "?";
const SVELTE_EXTENSION = ".svelte";
const CSS_EXTENSION = ".css";
const sharedImport = /(import\s+)(["'])(\.{1,2}\/[^"'\n]+\.css)\2/gu;
const STYLE_OPENING = "<style";
const styleBlocks = /<style[\s\S]*?<\/style>/gu;

function withoutStyle(source: string) {
  return source.replace(styleBlocks, STYLE_OPENING);
}

function isComponentId(id: string) {
  return id.endsWith(SVELTE_EXTENSION) && !id.includes(QUERY_START);
}

function isSheetId(id: string) {
  return id.endsWith(`${SVELTE_EXTENSION}${SHEET_SUFFIX}`) || id.endsWith(`${CSS_EXTENSION}${SHEET_SUFFIX}`);
}

// A `.css` a component imports is a sheet of the window, not a file for a
// browser to inject, so the import becomes the sheet module's.
function withSharedSheets(code: string) {
  return code.replace(sharedImport, (_, keyword: string, quote: string, specifier: string) => `${keyword}${quote}${specifier}${SHEET_SUFFIX}${quote}`);
}

/**
 * The Vite plugin that turns every component's `<style>` into the module that
 * registers its WinUI Styles. For `Card.svelte` it adds
 * `import "Card.svelte-winui-css.js"` to the compiled component; that module
 * is the translated sheet (see `sheet-module.ts`). Editing a `<style>`
 * reloads that module as well (`hotUpdate`), so the open window restyles in
 * place.
 *
 * `compilerOptions` must be the ones the component is compiled with (its
 * `rootDir` sets the scoping class both agree on):
 *
 *   plugins: [svelte({ compilerOptions }), winuiCss({ root, compilerOptions })]
 */
export function winuiCss(options: WinuiCssOptions) {
  const resources = loadWinuiCatalogue();
  const runtimeModule = options.runtimeModule ?? DEFAULT_RUNTIME_MODULE;
  let root = options.root ?? "";
  let isServing = false;
  function isReported() {
    const isAlwaysReported = options.onError === "report";
    const isReportedWhenServing = options.onError === "report-when-serving" && isServing;
    return isAlwaysReported || isReportedWhenServing;
  }

  // Each component as last compiled, less its <style> blocks.
  const withoutStyles = new Map<string, string>();
  return {
    name: PLUGIN_NAME,
    enforce: "post",
    configResolved(config) {
      root = options.root ?? config.root;
      isServing = config.command === "serve";
    },
    transform(code, id) {
      if (!isComponentId(id)) {
        return null;
      }

      const source = readFileSync(id, "utf8");
      withoutStyles.set(id, withoutStyle(source));
      const shared = withSharedSheets(code);
      const hasStyle = source.includes(STYLE_OPENING) || markupStyleProperties(source).length > 0;
      if (!hasStyle) {
        return shared === code ? null : {
          code: shared,
          map: null
        };
      }

      return {
        code: `${shared}\nimport ${JSON.stringify(`${id}${SHEET_SUFFIX}`)};\n`,
        map: null
      };
    },
    // The sheet module is not the component's file, so a change to the
    // component does not reach it by itself. A change to the <style> alone is
    // the sheet's: the component is left running, with its state, and its live
    // elements restyle.
    hotUpdate({ file, modules }) {
      const isSharedFile = file.endsWith(CSS_EXTENSION);
      const sharedSheet = isSharedFile ? this.environment.moduleGraph.getModuleById(`${file}${SHEET_SUFFIX}`) : undefined;
      const isSharedSheetLoaded = sharedSheet !== undefined;
      if (isSharedSheetLoaded) {
        return [sharedSheet];
      }

      const sheet = this.environment.moduleGraph.getModuleById(`${file}${SHEET_SUFFIX}`);
      const isSheetMissing = sheet === undefined;
      if (isSheetMissing) {
        return undefined;
      }

      const previous = withoutStyles.get(file);
      const current = withoutStyle(readFileSync(file, "utf8"));
      withoutStyles.set(file, current);
      const isStyleOnlyChange = previous === current;
      return isStyleOnlyChange ? [sheet] : [...modules, sheet];
    },
    // The import a component gets may be root-relative (`/window/a.svelte-winui-css.js`):
    // the sheet's id has to be the file's own path, which `load` reads.
    async resolveId(source, importer, resolveOptions) {
      if (!isSheetId(source)) {
        return null;
      }

      const component = source.slice(0, -SHEET_SUFFIX.length);
      const resolved = await this.resolve(component, importer, {
        ...resolveOptions,
        skipSelf: true
      });
      return resolved === null ? null : `${resolved.id}${SHEET_SUFFIX}`;
    },
    load(id) {
      if (!isSheetId(id)) {
        return null;
      }

      const filename = id.slice(0, -SHEET_SUFFIX.length);
      this.addWatchFile(filename);
      const isSharedFile = filename.endsWith(CSS_EXTENSION);
      if (isSharedFile) {
        return compileCssFileModule({
          source: readFileSync(filename, "utf8"),
          sheetId: path.relative(root, filename).replaceAll("\\", "/"),
          resources,
          runtimeModule,
          isHot: true
        }).code;
      }

      try {
        const source = readFileSync(filename, "utf8");
        const problems = validateComponent({
          source,
          filename,
          resources,
          sheetId: path.relative(root, filename).replaceAll("\\", "/"),
          compilerOptions: options.compilerOptions
        });
        for (const problem of problems.filter(item => item.severity === "warning")) {
          this.warn(formatValidation(problem));
        }

        const errors = problems.filter(item => item.severity === "error");
        const hasErrors = errors.length > 0;
        if (hasErrors) {
          const report = errors.map(formatValidation).join("\n");
          if (isReported()) {
            process.stderr.write(`${report}\n`);
            return "export default null;";
          }

          this.error(report);
        }

        const module = compileSheetModule({
          filename,
          source,
          sheetId: path.relative(root, filename).replaceAll("\\", "/"),
          resources,
          runtimeModule,
          compilerOptions: options.compilerOptions,
          isHot: true
        });
        for (const diagnostic of module?.diagnostics ?? []) {
          this.warn(formatDiagnostic(diagnostic));
        }

        return module === null ? "export default null;" : module.code;
      } catch (error) {
        const isReportedSheet = error instanceof SheetError && isReported();
        if (isReportedSheet) {
          process.stderr.write(`${error.message}\n`);
          return "export default null;";
        }

        const isSheetError = error instanceof SheetError;
        if (isSheetError) {
          this.error(error.message);
        }

        throw error;
      }
    }
  } satisfies Plugin;
}
