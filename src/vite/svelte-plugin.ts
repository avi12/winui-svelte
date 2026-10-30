import { withElementAnimation } from "./compile.ts";
import { isPatchedRuntime, patchSvelteRuntime } from "./runtime-patch.ts";
import { scopedMarkup } from "#src/css/runtime/sheet-module.js";
import type { CompileOptions, ModuleCompileOptions } from "svelte/compiler";
import { compile, compileModule } from "svelte/compiler";
import type { Plugin, Rollup } from "vite";

/**
 * Compiles `.svelte` components and `.svelte.js` / `.svelte.ts` runes modules
 * with Svelte's own compiler, in place of `@sveltejs/vite-plugin-svelte`:
 * the window needs the compile and Svelte's hot module replacement, and not
 * that package's preprocessors, CSS handling or SSR (a component's `<style>`
 * is the WinUI sheet `css/vite.ts` makes).
 */
const SVELTE_PLUGIN_NAME = "winui-svelte:svelte";

const EDITOR_PLUGIN_NAME = "vite-plugin-svelte:config";
const COMPONENT_PATTERN = /\.svelte$/u;
const MODULE_PATTERN = /\.svelte\.[jt]s$/u;
const SERVE_COMMAND = "serve";

interface CompiledSourceMap {
  version: number;
  file?: string;
  sources: string[];
  sourcesContent?: Array<string | null>;
  names: string[];
  mappings: string;
}

// Svelte types its map with magic-string's class, which the emitted .d.ts
// could not name; the plain fields are all Vite reads.
function plainSourceMap({ version, file, sources, sourcesContent, names, mappings }: CompiledSourceMap) {
  return {
    version,
    ...file === undefined ? {} : { file },
    sources,
    ...sourcesContent === undefined ? {} : { sourcesContent },
    names,
    mappings
  };
}

interface SvelteDiagnostic {
  code?: string;
  filename?: string;
  start?: {
    line: number;
    column: number;
  };
  frame?: string;
}

// A Svelte compile error as Vite prints one: its file, line and column, and
// the lines around it.
function viteErrorOf({ error, id }: {
  error: Error & SvelteDiagnostic;
  id: string;
}) {
  const { start, frame, code } = error;
  return Object.assign(error, {
    id,
    plugin: SVELTE_PLUGIN_NAME,
    frame,
    code,
    loc: start ? {
      file: id,
      line: start.line,
      column: start.column
    } : undefined
  });
}

function isFailure(value: unknown): value is Error & SvelteDiagnostic {
  return value instanceof Error;
}

function reportWarnings({ context, warnings, filename }: {
  context: Rollup.TransformPluginContext;
  warnings: ReadonlyArray<{
    message: string;
    code: string;
    start?: {
      line: number;
      column: number;
    } | undefined;
  }>;
  filename: string;
}) {
  for (const warning of warnings) {
    context.warn({
      message: warning.message,
      code: warning.code,
      id: filename,
      ...warning.start && {
        loc: {
          file: filename,
          line: warning.start.line,
          column: warning.start.column
        }
      }
    });
  }
}

function failureOf({ error, filename }: {
  error: unknown;
  filename: string;
}) {
  return isFailure(error) ? viteErrorOf({
    error,
    id: filename
  }) : error;
}

function pathOf(id: string) {
  return id.replace(/[?#].*$/u, "");
}

/**
 * The Vite plugins that compile Svelte files: components, and the runes
 * modules Vite has already turned from TypeScript into JavaScript. Svelte's
 * runtime is read with the package's event edits.
 *
 * @param options - What every component is compiled with.
 * @returns The plugins, hot-reloading in `serve` and compiled for production
 * in `build`; the third tells editors the project's Svelte options.
 */
export function svelteCompiler(options: CompileOptions) {
  let isDevelopment = false;
  let isServing = false;
  const components = {
    name: SVELTE_PLUGIN_NAME,
    enforce: "pre",
    configResolved(config) {
      isDevelopment = !config.isProduction;
      isServing = config.command === SERVE_COMMAND;
    },
    transform(code, id) {
      const filename = pathOf(id);
      if (isPatchedRuntime(filename)) {
        return patchSvelteRuntime({
          filename,
          source: code
        });
      }

      const isComponent = COMPONENT_PATTERN.test(filename) && id === filename;
      if (!isComponent) {
        return null;
      }

      try {
        const { js, warnings } = compile(
          scopedMarkup({
            source: code,
            file: filename,
            filename
          }), {
            ...options,
            dev: isDevelopment,
            hmr: isDevelopment && isServing,
            css: "external",
            filename
          }
        );
        reportWarnings({
          context: this,
          warnings,
          filename
        });
        return {
          code: withElementAnimation({
            source: code,
            code: js.code,
            isComponent: true
          }),
          map: plainSourceMap(js.map)
        };
      } catch (error) {
        throw failureOf({
          error,
          filename
        });
      }
    }
  } satisfies Plugin;
  const modules = {
    name: `${SVELTE_PLUGIN_NAME}-modules`,
    transform(code, id) {
      const filename = pathOf(id);
      const isModule = MODULE_PATTERN.test(filename) && id === filename;
      if (!isModule) {
        return null;
      }

      const moduleOptions: ModuleCompileOptions = {
        generate: "client",
        dev: isDevelopment,
        filename
      };
      try {
        const { js, warnings } = compileModule(code, moduleOptions);
        reportWarnings({
          context: this,
          warnings,
          filename
        });
        return {
          code: withElementAnimation({
            source: code,
            code: js.code,
            isComponent: false
          }),
          map: plainSourceMap(js.map)
        };
      } catch (error) {
        throw failureOf({
          error,
          filename
        });
      }
    }
  } satisfies Plugin;
  // The Svelte language server (the editor, svelte-check) reads a project's
  // Svelte options from a Vite plugin of this name; without one it reports
  // that the project has no Svelte configuration.
  const editor = {
    name: EDITOR_PLUGIN_NAME,
    api: {
      options: {
        compilerOptions: {
          css: "external"
        }
      }
    }
  } satisfies Plugin;
  return [components, modules, editor];
}
