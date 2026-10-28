import { describeError, errorOf } from "./diagnostics.ts";
import { compileSheetModule, cssHash, SheetError } from "#src/css/runtime/sheet-module.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { compile, compileModule } from "svelte/compiler";

/**
 * The module a component imports its renderer from: a package specifier, or
 * a file, which the component then imports by relative path.
 */
export const WINUI_RENDERER = "winui-svelte/host";

const COMPONENT_EXTENSION = ".svelte";
const RUNES_EXTENSION = ".svelte.ts";
const WINUI_CSS_RUNTIME = "winui-svelte/css";
const resources = loadWinuiCatalogue();

/**
 * How `.svelte` components (and the `.svelte.ts` modules that use runes)
 * become JavaScript where Vite is not in the way: a bundler building a
 * release (esbuild) and tests. Components render through the WinUI renderer
 * unless told another one (the tests render through one without WinUI). The
 * dev server does the same through the Vite plugin (`plugin.ts`).
 */
export interface CompileOptions {
  /** The module a component imports its renderer from. */
  renderer?: string;
  /** Sheet ids and their diagnostics are paths relative to this. */
  root?: string;
  /** The module that exports registerStyleSheet, as the compiled component imports it. */
  cssRuntime?: string;
}

function importPath({ filename, module }: {
  filename: string;
  module: string;
}) {
  const relative = path.relative(path.dirname(filename), module).replaceAll("\\", "/");
  return relative.startsWith(".") ? relative : `./${relative}`;
}

/** How a component at `filename` imports the renderer. */
export function rendererImport({ filename, renderer }: {
  filename: string;
  renderer: string;
}) {
  return path.isAbsolute(renderer) ? importPath({
    filename,
    module: renderer
  }) : renderer;
}

/** Whether a file is a component or a runes module. */
export function isSvelteFile(filename: string) {
  return filename.endsWith(COMPONENT_EXTENSION) || filename.endsWith(RUNES_EXTENSION);
}

const SOURCE_MAP_PREFIX = "//# sourceMappingURL=data:application/json;base64,";

// Last, after anything appended to the component, so Node (--enable-source-maps),
// a bundler and the IDE's debugger read the component's own lines.
function withInlineSourceMap({ code, map }: {
  code: string;
  map: object;
}) {
  const encoded = Buffer.from(JSON.stringify(map)).toString("base64");
  return `${code}\n${SOURCE_MAP_PREFIX}${encoded}\n`;
}

function compileSource({ filename, source, options }: {
  filename: string;
  source: string;
  options: CompileOptions;
}) {
  if (filename.endsWith(RUNES_EXTENSION)) {
    const { js } = compileModule(stripTypeScriptTypes(source), {
      filename,
      generate: "client"
    });
    return withInlineSourceMap({
      code: js.code,
      map: js.map
    });
  }

  const renderer = options.renderer ?? WINUI_RENDERER;
  const { js } = compile(source, {
    filename,
    generate: "client",
    runes: true,
    cssHash,
    experimental: {
      customRenderer: ({ filename: name }) => rendererImport({
        filename: name,
        renderer
      })
    }
  });
  // The dev server registers the sheet through the Vite plugin (css/vite.ts);
  // here its statements are appended to the component.
  const sheet = compileSheetModule({
    filename,
    source,
    sheetId: path.relative(options.root ?? path.dirname(filename), filename).replaceAll("\\", "/"),
    resources,
    runtimeModule: options.cssRuntime ?? WINUI_CSS_RUNTIME
  });
  return withInlineSourceMap({
    code: sheet === null ? js.code : `${js.code}\n${sheet.code}`,
    map: js.map
  });
}

/**
 * Compiles a component or a runes module to JavaScript. A compile error is
 * thrown as one that names the file and line, which a bundler prints as it
 * is. A `<style>` WinUI cannot say fails the build with each rule's
 * `file:line:column: property has no WinUI meaning (why)`.
 */
export function compileSvelte({ filename, source, options = {} }: {
  filename: string;
  source: string;
  options?: CompileOptions;
}) {
  try {
    return compileSource({
      filename,
      source,
      options
    });
  } catch (error) {
    const failure = errorOf(error);
    throw new Error(failure instanceof SheetError ? failure.message : describeError(failure), { cause: error });
  }
}
