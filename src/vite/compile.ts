import { describeError, errorOf } from "./diagnostics.ts";
import { compileSheetModule, cssHash, scopedMarkup, SheetError } from "#src/css/runtime/sheet-module.js";
import { loadWinuiCatalogue } from "#src/css/translate/catalogue.js";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import type { CompileOptions as SvelteCompileOptions } from "svelte/compiler";
import { compile, compileModule, parse } from "svelte/compiler";

const COMPONENT_EXTENSION = ".svelte";
const RUNES_EXTENSION = ".svelte.ts";
const WINUI_CSS_RUNTIME = "winui-svelte/css";
const resources = loadWinuiCatalogue();
// What Svelte warns about markup written for HTML: WinUI's tags are not
// HTML's, so a self-closing <grid />, an unknown attribute or a click on a
// <border> is not a mistake.
const HTML_ONLY_WARNING = /^(?:a11y_|element_invalid_self_closing_tag$|attribute_illegal_colon$|attribute_avoid_is$|attribute_invalid_property_name$|css_unused_selector$)/u;

/**
 * What every component is compiled with, whoever compiles it: for the
 * client, whose runtime draws through the tree (see `installDom`), with
 * the scoping class the component's `<style>` rules name.
 */
export const WINUI_COMPILE_OPTIONS = {
  generate: "client",
  cssHash,
  warningFilter: ({ code }) => !HTML_ONLY_WARNING.test(code)
} satisfies SvelteCompileOptions;

/**
 * How `.svelte` components (and the `.svelte.ts` modules that use runes)
 * become JavaScript where Vite is not in the way: a bundler building a
 * release (esbuild) and tests. The dev server does the same through the Vite
 * plugin (`plugin.ts`).
 */
export interface CompileOptions {
  /** Sheet ids and their diagnostics are paths relative to this. */
  root?: string;
  /** The module that exports registerStyleSheet, as the compiled component imports it. */
  cssRuntime?: string;
  /** The module that exports enableElementAnimation, as a component that uses a transition imports it. */
  animationRuntime?: string;
  /** The module that exports enableElementEffects, as a component that uses the blur or draw transition imports it. */
  effectsRuntime?: string;
}

const ELEMENT_ANIMATION_DIRECTIVES = new Set(["TransitionDirective", "AnimateDirective"]);
const ELEMENT_ANIMATION_IMPORT = /\bfrom\s*["']svelte\/(?:transition|animate|motion)["']/u;
const ELEMENT_EFFECTS_IMPORT = /import\s*\{[^}]*\b(?:blur|draw)\b[^}]*\}\s*from\s*["']svelte\/transition["']/u;
const ELEMENT_ANIMATION_RUNTIME = "winui-svelte/element-animation";
const ELEMENT_EFFECTS_RUNTIME = "winui-svelte/element-effects";
const ELEMENT_EFFECTS_BINDING = "winuiEnableElementEffects";
const ELEMENT_ANIMATION_BINDING = "winuiEnableElementAnimation";

function hasDirective(root: unknown) {
  const pending: unknown[] = [root];
  for (const node of pending) {
    const isObject = typeof node === "object" && node !== null;
    if (!isObject) {
      continue;
    }

    const isDirective = "type" in node && typeof node.type === "string" && ELEMENT_ANIMATION_DIRECTIVES.has(node.type);
    if (isDirective) {
      return true;
    }

    pending.push(...Object.values(node));
  }

  return false;
}

/**
 * Adds to a compiled module the statements that turn on the element
 * animation of `winui-svelte/element-animation`, when its source uses
 * `transition:`, `in:`, `out:` or `animate:`, or imports
 * `svelte/transition`, `svelte/animate` or `svelte/motion`: Svelte's
 * transitions then run on WinUI controls, and an app that uses none never
 * bundles any of it. A source that imports `blur` or `draw` of `svelte/transition`
 * also turns on `winui-svelte/element-effects`, which blurs for real and
 * measures a path. The calls are idempotent, so every such module may make them.
 *
 * @param options - The module's source and what it compiled to, whether it is a component,
 *   and the module that exports `enableElementAnimation`.
 * @returns The compiled module, with the registration appended when it needs one.
 */
export function withElementAnimation({
  source,
  code,
  isComponent,
  runtime = ELEMENT_ANIMATION_RUNTIME,
  effectsRuntime = ELEMENT_EFFECTS_RUNTIME
}: {
  source: string;
  code: string;
  isComponent: boolean;
  runtime?: string;
  effectsRuntime?: string;
}) {
  const isImported = ELEMENT_ANIMATION_IMPORT.test(source);
  const isNeeded = isImported || isComponent && hasDirective(
    parse(source, {
      modern: true
    })
  );
  if (!isNeeded) {
    return code;
  }

  const registration = `import { enableElementAnimation as ${ELEMENT_ANIMATION_BINDING} } from ${JSON.stringify(runtime)};\n${ELEMENT_ANIMATION_BINDING}();`;
  const isBlurOrDraw = ELEMENT_EFFECTS_IMPORT.test(source);
  const effects = isBlurOrDraw ? `\nimport { enableElementEffects as ${ELEMENT_EFFECTS_BINDING} } from ${JSON.stringify(effectsRuntime)};\n${ELEMENT_EFFECTS_BINDING}();` : "";
  return `${code}\n${registration}${effects}\n`;
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
      code: withElementAnimation({
        source,
        code: js.code,
        isComponent: false,
        ...options.animationRuntime && {
          runtime: options.animationRuntime
        },
        ...options.effectsRuntime && {
          effectsRuntime: options.effectsRuntime
        }
      }),
      map: js.map
    });
  }

  const markup = scopedMarkup({
    source,
    file: filename,
    filename
  });
  const { js } = compile(markup, {
    ...WINUI_COMPILE_OPTIONS,
    filename,
    runes: true
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
    code: withElementAnimation({
      source,
      code: sheet === null ? js.code : `${js.code}\n${sheet.code}`,
      isComponent: true,
      ...options.animationRuntime && {
        runtime: options.animationRuntime
      },
      ...options.effectsRuntime && {
        effectsRuntime: options.effectsRuntime
      }
    }),
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
