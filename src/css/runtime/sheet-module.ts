import type { ResourceCatalogue } from "./resources.ts";
import { resolveRelationalSelectors } from "#src/css/relational/relational.js";
import { withInstancesAsElements, withScopedInstances } from "#src/css/relational/scope.js";
import { LAZY_GROUPS } from "#src/css/translate/lazy-groups.js";
import { errorsOf, formatDiagnostic, translateStyleSheet } from "#src/css/translate/translate.js";
import type { Diagnostic, Rule, StyleSheetData } from "#src/css/translate/types.js";
import { markupStyleProperties } from "#src/css/validate/markup-declarations.js";
import type { CompileOptions, Warning } from "svelte/compiler";
import { compile } from "svelte/compiler";

/**
 * Neither a query nor `.svelte.` in the name: the Vite plugin compiles
 * `a.svelte?x` as a component and `a.svelte.x` as a rune module.
 */
export const SHEET_SUFFIX = "-winui-css.js";

const REGISTER_ALIAS = "registerWinuiSheet";
const GROUPS_ALIAS = "registerWinuiGroups";
const LAZY_ALIAS = "winuiLazyGroups";
const UNUSED_SELECTOR = "css_unused_selector";
const PROBE = "<i></i><style>i{color:red}</style>";

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

const probed = new Map<string, string>();
const TRANSLATION_CACHE_SIZE = 64;

interface CachedTranslation {
  resources: ResourceCatalogue;
  compilerOptions: CompileOptions | undefined;
  translation: ReturnType<typeof translateUncached>;
}

const translations = new Map<string, CachedTranslation>();

/**
 * The scoping class Svelte gives the elements of the component at `filename`
 * (`svelte-` and a hash its compiler makes of the path relative to
 * `rootDir`, the working folder by default). It is read out of a compile of a
 * probe component with the same `filename` and `rootDir` and Svelte's own
 * default `cssHash`, so the class on a component instance is the class Svelte
 * puts on the style rule, whatever the working folder.
 */
export function scopeClassOf({ filename, rootDir }: {
  filename: string;
  rootDir?: string | undefined;
}) {
  const key = [process.cwd(), rootDir, filename].join("|");
  const known = probed.get(key);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const { css } = compile(PROBE, {
    filename,
    css: "external",
    ...rootDir !== undefined && {
      rootDir
    }
  });
  const found = /svelte-[a-z0-9]+/u.exec(css?.code ?? "")?.[0] ?? "";
  probed.set(key, found);
  return found;
}

/**
 * The component's source as Svelte compiles it for the window: relational
 * selectors resolved, and the scope class on every component instance, so the
 * sheet's scoped selectors match the elements and instances the markup writes.
 */
export function scopedMarkup({ source, file, filename, rootDir }: {
  source: string;
  file: string;
  filename: string;
  rootDir?: string | undefined;
}) {
  return withScopedInstances({
    source: resolveRelationalSelectors({
      source,
      file
    }).source,
    scopeOf: () => scopeClassOf({
      filename,
      rootDir
    })
  });
}

/** A stylesheet with something WinUI cannot say; the message lists every error, one per line. */
export class SheetError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.filter(diagnostic => diagnostic.severity === "error").map(formatDiagnostic).join("\n"));
    this.diagnostics = diagnostics;
  }
}

// The imports and calls that register the opt-in groups the sheet's properties need.
function groupRegistration({ sheet, markupRules, runtimeModule }: {
  sheet: StyleSheetData;
  markupRules: readonly Rule[];
  runtimeModule: string;
}) {
  const used = LAZY_GROUPS.filter(lazy => sheet.rules.some(lazy.isNeededBy) || markupRules.some(lazy.isNeededBy));
  const hasUsed = used.length > 0;
  if (!hasUsed) {
    return [];
  }

  const imports = used.map((lazy, index) => {
    const from = JSON.stringify(runtimeModule + lazy.subpath);
    return `import { ${lazy.exportName} as ${LAZY_ALIAS}${index} } from ${from};`;
  });
  return [
    `import { registerPropertyGroups as ${GROUPS_ALIAS} } from ${JSON.stringify(runtimeModule)};`,
    ...imports,
    ...used.map((_, index) => `${GROUPS_ALIAS}(${LAZY_ALIAS}${index}());`)
  ];
}

// The statements that register a sheet. They name nothing a component might
// (the import is aliased), so they can be appended to a compiled component.
function registrationCode({ sheet, markupRules, runtimeModule }: {
  sheet: StyleSheetData;
  markupRules: readonly Rule[];
  runtimeModule: string;
}) {
  return [
    `import { registerStyleSheet as ${REGISTER_ALIAS} } from ${JSON.stringify(runtimeModule)};`,
    ...groupRegistration({
      sheet,
      markupRules,
      runtimeModule
    }),
    `${REGISTER_ALIAS}(${JSON.stringify(sheet)});`
  ].join("\n");
}

// The properties a component's markup sets (`style:clip-path={shape}`) as
// rules, so the opt-in groups they need are registered as they are for a
// `<style>`: a window that never reads a clip in a stylesheet still parses
// one a directive gives.
function markupRulesOf(source: string) {
  const properties = markupStyleProperties(source);
  const hasProperties = properties.length > 0;
  if (!hasProperties) {
    return [];
  }

  const rule: Rule = {
    elementType: null,
    classes: [],
    state: null,
    specificity: 0,
    order: 0,
    resourcesXaml: null,
    declarations: properties.map(property => ({
      property,
      value: "",
      isImportant: false,
      at: {
        line: 1,
        column: 1
      }
    }))
  };
  return [rule];
}

// A component with no `<style>` whose markup needs opt-in groups: the module
// registers them and no sheet.
function markupOnlyModule(input: SheetModuleInput) {
  const sheet: StyleSheetData = {
    id: input.sheetId,
    rules: [],
    keyframes: [],
    resourcesXaml: null
  };
  const groups = groupRegistration({
    sheet,
    markupRules: markupRulesOf(input.source),
    runtimeModule: input.runtimeModule
  });
  const hasGroups = groups.length > 0;
  if (!hasGroups) {
    return null;
  }

  return {
    code: `${groups.join("\n")}\n`,
    sheet,
    diagnostics: []
  };
}

// Svelte's own report of a rule that matches no element or component instance.
function unusedSelectors({ warnings, file }: {
  warnings: readonly Warning[];
  file: string;
}) {
  return warnings.map(({ message, start }) => ({
    severity: "warning" as const,
    message,
    file,
    at: {
      line: start?.line ?? 1,
      column: (start?.column ?? 0) + 1
    }
  }));
}

/**
 * The messages of Svelte's `css_unused_selector` warnings for a component read
 * with its instances as elements: what remains unused once a rule may match
 * `<TextBlock class="title">`. The plain compiler, which `svelte-check` and the
 * editor run, cannot see those instances and warns for every such rule.
 */
export function unusedSelectorMessages(input: {
  source: string;
  filename: string;
}) {
  return unusedWarnings(input).map(({ message }) => message);
}

// Svelte's verdict on the component as the author wrote it, instances read as elements: the
// selectors are the author's own, never the generated classes the relational pass puts in their place.
function unusedWarnings({ source, filename }: {
  source: string;
  filename: string;
}) {
  return compile(withInstancesAsElements(source), {
    runes: true,
    filename,
    generate: "client",
    css: "external",
    warningFilter: ({ code }) => code === UNUSED_SELECTOR
  }).warnings;
}

/**
 * Translates a component's `<style>` the way the build does (relational
 * selectors resolved, Svelte compiling and scoping the CSS, then the
 * translation); null when the component has none. The one place the
 * validator and the build share, so they cannot disagree.
 */
export function translateComponent(input: Omit<SheetModuleInput, "isHot" | "runtimeModule">) {
  const key = [input.filename, input.sheetId, input.source].join("|");
  const cached = translations.get(key);
  const isCached = cached?.resources === input.resources && cached.compilerOptions === input.compilerOptions;
  if (isCached) {
    return cached.translation;
  }

  const translation = translateUncached(input);
  translations.delete(key);
  translations.set(key, {
    resources: input.resources,
    compilerOptions: input.compilerOptions,
    translation
  });
  const isFull = translations.size > TRANSLATION_CACHE_SIZE;
  if (isFull) {
    translations.delete(translations.keys().next().value ?? key);
  }

  return translation;
}

function translateUncached(input: Omit<SheetModuleInput, "isHot" | "runtimeModule">) {
  const relational = resolveRelationalSelectors({
    source: input.source,
    file: input.sheetId
  });
  const hasRelationalErrors = relational.diagnostics.length > 0;
  if (hasRelationalErrors) {
    return {
      sheet: null,
      diagnostics: relational.diagnostics
    };
  }

  const result = compile(withInstancesAsElements(relational.source), {
    runes: true,
    ...input.compilerOptions,
    filename: input.filename,
    generate: "client",
    css: "external",
    warningFilter: ({ code }) => code === UNUSED_SELECTOR
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
  return {
    ...translation,
    diagnostics: [...unusedSelectors({
      warnings: unusedWarnings({
        source: input.source,
        filename: input.filename
      }),
      file: input.sheetId
    }), ...translation.diagnostics]
  };
}

/**
 * Compiles a component's `<style>` into its registration module; null when
 * the component has no `<style>`. Throws SheetError when the CSS has
 * something WinUI cannot say.
 */
export function compileSheetModule(input: SheetModuleInput) {
  const translation = translateComponent(input);
  const isStyleMissing = translation === null;
  if (isStyleMissing) {
    return markupOnlyModule(input);
  }

  const sheet = translation.sheet;
  const isSheetMissing = sheet === null;
  const hasErrors = isSheetMissing || errorsOf({
    sheet,
    diagnostics: translation.diagnostics
  }).length > 0;
  if (hasErrors) {
    throw new SheetError(translation.diagnostics);
  }

  const hot = input.isHot === true ? "\nif (import.meta.hot) {\n  import.meta.hot.accept();\n}" : "";
  return {
    code: `${registrationCode({
      sheet,
      markupRules: markupRulesOf(input.source),
      runtimeModule: input.runtimeModule
    })}${hot}\n`,
    sheet,
    diagnostics: translation.diagnostics
  };
}
