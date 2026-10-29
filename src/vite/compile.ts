import { describeError, errorOf } from "./diagnostics.ts";
import { compileSheetModule, cssHash, SheetError } from "#src/css/runtime/sheet-module.js";
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
const HTML_ONLY_WARNING = /^(?:a11y_|element_invalid_self_closing_tag$|attribute_illegal_colon$|attribute_avoid_is$|attribute_invalid_property_name$)/u;

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
}

const WEB_ANIMATION_DIRECTIVES = new Set(["TransitionDirective", "AnimateDirective"]);

interface DirectiveFound {
  readonly name: string;
  readonly start: number;
}

function directiveIn(root: unknown) {
  const pending: unknown[] = [root];
  for (const node of pending) {
    const isObject = typeof node === "object" && node !== null;
    if (!isObject) {
      continue;
    }

    const isDirective = "type" in node && typeof node.type === "string" && WEB_ANIMATION_DIRECTIVES.has(node.type);
    const isNamed = "name" in node && typeof node.name === "string" && "start" in node && typeof node.start === "number";
    const isFound = isDirective && isNamed;
    if (isFound) {
      return {
        name: String(node.name),
        start: Number(node.start)
      } satisfies DirectiveFound;
    }

    pending.push(...Object.values(node));
  }

  return null;
}

/**
 * Throws, naming the line, when a component uses `transition:`, `in:`,
 * `out:` or `animate:`: they drive the browser's `Element.animate()`, which a
 * WinUI window has no equivalent of. The `transition`, `intro` and `outro`
 * attachments of `winui-svelte/element-animation` play the same functions.
 *
 * @param options - The component's path and source.
 * @throws {Error} When the component uses one of the directives.
 */
export function assertNoWebAnimations({ filename, source }: {
  filename: string;
  source: string;
}) {
  const found = directiveIn(parse(source, { modern: true }));
  if (found) {
    const line = source.slice(0, found.start).split("\n").length;
    throw new Error(`${path.basename(filename)}:${line}: transition:, in:, out: and animate: need the browser's Element.animate(); use the transition, intro and outro attachments of winui-svelte/element-animation instead (${found.name})`);
  }
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

  const { js } = compile(source, {
    ...WINUI_COMPILE_OPTIONS,
    filename,
    runes: true
  });
  assertNoWebAnimations({
    filename,
    source
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
