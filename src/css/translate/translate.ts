import { gradientGroups } from "./background-properties.ts";
import { computeDeclarations, resourceDictionaryXaml } from "./cascade.ts";
import { lowerDeclarations } from "./properties.ts";
import { expandDeclaration } from "./shorthands.ts";
import { ColorScheme } from "./types.ts";
import type {
  Declaration,
  Diagnostic,
  ResourceEntry,
  Rule,
  Severity,
  SourcePosition,
  StyleSheetData,
  Translation
} from "./types.ts";
import { variableEntries } from "./variables.ts";
import type { Variable, VariableEntry } from "./variables.ts";
import type { AtRuleBlock, Block, RuleBlock } from "#src/css/parse/parser.js";
import { BlockKind, CssSyntaxError, parseCss } from "#src/css/parse/parser.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import type { ParsedSelector } from "#src/css/parse/selectors.js";
import { parseSelectorList } from "#src/css/parse/selectors.js";
import type { PositionMapper, SourceMapV3 } from "#src/css/parse/source-map.js";
import { createPositionMapper } from "#src/css/parse/source-map.js";
import type { ResourceCatalogue, ResourceKind } from "#src/css/runtime/resources.js";
import { hasStyle, resolveVariable } from "#src/css/runtime/resources.js";

/**
 * What to translate: Svelte's compiled CSS for one component. Its rules
 * become data the runtime matches against elements, its custom properties
 * (`--accent`) become a XAML ResourceDictionary, and everything WinUI cannot
 * say is a diagnostic with the line the author wrote.
 */
export interface TranslateInput {
  /** Names the sheet and prefixes its diagnostics. */
  file: string;
  /** `css.code` of Svelte's compile result (css: "external"). */
  css: string;
  map?: SourceMapV3 | undefined;
  resources: ResourceCatalogue;
}

// The @media queries that name a scheme: WinUI's theme dictionaries, and the
// high contrast one (forced colors, in CSS's words).
const SCHEME_QUERIES: ReadonlyArray<[RegExp, ColorScheme]> = [
  [/^\(\s*prefers-color-scheme\s*:\s*dark\s*\)$/iu, ColorScheme.DARK],
  [/^\(\s*prefers-color-scheme\s*:\s*light\s*\)$/iu, ColorScheme.LIGHT],
  [/^\(\s*forced-colors\s*:\s*active\s*\)$/iu, ColorScheme.HIGH_CONTRAST]
];

interface LocatedVariable extends Variable {
  at: SourcePosition;
}

interface Translator {
  input: TranslateInput;
  mapPosition: PositionMapper;
  diagnostics: Diagnostic[];
  variables: LocatedVariable[];
  /** The kinds of the resources custom properties define, anywhere in the sheet. */
  kinds: Map<string, ResourceKind>;
  rules: Rule[];
  nextOrder: number;
}

function report({ translator, severity, message, position }: {
  translator: Translator;
  severity: Severity;
  message: string;
  position: SourcePosition;
}) {
  translator.diagnostics.push({
    severity,
    message,
    file: translator.input.file,
    at: position
  });
}

function reportError({ translator, message, generatedAt }: {
  translator: Translator;
  message: string;
  generatedAt: SourcePosition;
}) {
  report({
    translator,
    severity: "error",
    message,
    position: translator.mapPosition(generatedAt)
  });
}

function schemeOf({ translator, block }: {
  translator: Translator;
  block: AtRuleBlock;
}) {
  const scheme = block.name === "media" ? SCHEME_QUERIES.find(([query]) => query.test(block.prelude))?.[1] : undefined;
  const isSchemeMissing = scheme === undefined;
  if (isSchemeMissing) {
    const what = block.name === "media" ? `@media ${block.prelude}` : `@${block.name}`;
    reportError({
      translator,
      message: `${what} has no WinUI meaning (only @media (prefers-color-scheme: dark), (prefers-color-scheme: light) and (forced-colors: active) do, for custom properties)`,
      generatedAt: block.at
    });
    return null;
  }

  return scheme;
}

function originalDeclaration({ translator, declaration }: {
  translator: Translator;
  declaration: Declaration;
}) {
  return {
    ...declaration,
    at: translator.mapPosition(declaration.at)
  };
}

function reportDeclarations({ translator, declarations, message }: {
  translator: Translator;
  declarations: Declaration[];
  message: string;
}) {
  for (const declaration of declarations) {
    translator.diagnostics.push({
      severity: "error",
      message: `${declaration.property} ${message}`,
      file: translator.input.file,
      at: declaration.at
    });
  }
}

function reportDeclarationProblem({ translator, at, message }: {
  translator: Translator;
  at: SourcePosition;
  message: string;
}) {
  translator.diagnostics.push({
    severity: "error",
    message,
    file: translator.input.file,
    at
  });
}

// The resources a rule's custom properties define on each element it matches.
function scopedResources({ translator, customProperties, scheme }: {
  translator: Translator;
  customProperties: Declaration[];
  scheme: ColorScheme;
}) {
  const entries = customProperties.flatMap(custom => variableEntries({
    variable: {
      name: custom.property,
      value: custom.value,
      scheme
    },
    catalogue: translator.input.resources,
    reportProblem: message => reportDeclarationProblem({
      translator,
      at: custom.at,
      message
    })
  }));
  for (const entry of entries) {
    translator.kinds.set(entry.key, entry.kind);
  }

  return entries.map(entryOf);
}

function entryOf({ scheme, key, xaml }: VariableEntry) {
  return {
    scheme,
    key,
    xaml
  } satisfies ResourceEntry;
}

// One selector of a rule: `:root` custom properties become the app's
// resources, a rule's own become resources of the elements it matches, and its
// other declarations a rule, unless the selector or the @media cannot style.
function addSelectorRule({ translator, block, selector, scheme }: {
  translator: Translator;
  block: RuleBlock;
  selector: ParsedSelector;
  scheme: ColorScheme;
}) {
  const declarations = block.declarations.map(declaration => originalDeclaration({
    translator,
    declaration
  }));
  const customProperties = declarations.filter(declaration => declaration.property.startsWith("--"));
  const properties = declarations.filter(declaration => !declaration.property.startsWith("--"));
  if (selector.isRoot) {
    for (const custom of customProperties) {
      translator.variables.push({
        name: custom.property,
        value: custom.value,
        scheme,
        at: custom.at
      });
    }

    reportDeclarations({
      translator,
      declarations: properties,
      message: "has no WinUI meaning (:root styles no element; it can only declare custom properties)"
    });
    return;
  }

  const hasState = selector.state !== null;
  if (hasState) {
    reportDeclarations({
      translator,
      declarations: customProperties,
      message: `has no WinUI meaning in a :${selector.state} rule (the control's own template drives that state: override the resource it reads for it, such as --button-background-pointer-over)`
    });
  }

  const resources = hasState ? [] : scopedResources({
    translator,
    customProperties,
    scheme
  });
  const isSchemeConditional = scheme !== ColorScheme.DEFAULT;
  if (isSchemeConditional) {
    reportDeclarations({
      translator,
      declarations: properties,
      message: "has no WinUI meaning here (a Style cannot depend on the color scheme: set the color through var(--a-winui-brush) or declare a custom property on :root in the @media block)"
    });
  }

  const isUseless = isSchemeConditional && resources.length === 0;
  if (isUseless) {
    return;
  }

  translator.rules.push({
    elementType: selector.elementType,
    classes: selector.classes,
    state: selector.state,
    specificity: selector.specificity,
    order: translator.nextOrder,
    declarations: isSchemeConditional ? [] : properties,
    resources
  });
  translator.nextOrder++;
}

function addRuleBlock({ translator, block, scheme }: {
  translator: Translator;
  block: RuleBlock;
  scheme: ColorScheme;
}) {
  for (const nestedAt of block.nested) {
    reportError({
      translator,
      message: "nested rules have no WinUI meaning (write each selector at the top level)",
      generatedAt: nestedAt
    });
  }

  for (const result of parseSelectorList(block.selector)) {
    if (result.isValid) {
      addSelectorRule({
        translator,
        block,
        selector: result.selector,
        scheme
      });
    } else {
      reportError({
        translator,
        message: `selector "${block.selector}": ${result.reason}`,
        generatedAt: block.at
      });
    }
  }
}

function addBlocks({ translator, blocks, scheme }: {
  translator: Translator;
  blocks: Block[];
  scheme: ColorScheme;
}) {
  for (const block of blocks) {
    const isRuleBlock = block.kind === BlockKind.RULE;
    if (isRuleBlock) {
      addRuleBlock({
        translator,
        block,
        scheme
      });
      continue;
    }

    const isNestedMedia = scheme !== ColorScheme.DEFAULT;
    const inner = isNestedMedia ? null : schemeOf({
      translator,
      block
    });
    const { children } = block;
    const canNest = inner !== null && children !== null;
    if (isNestedMedia) {
      reportError({
        translator,
        message: `@${block.name} inside @media has no WinUI meaning`,
        generatedAt: block.at
      });
    } else if (canNest) {
      addBlocks({
        translator,
        blocks: children,
        scheme: inner
      });
    } else if (inner !== null) {
      reportError({
        translator,
        message: `@${block.name} has no WinUI meaning`,
        generatedAt: block.at
      });
    }
  }
}

const SCHEME_WORDS = new Map<ColorScheme, string>([
  [ColorScheme.LIGHT, "light"],
  [ColorScheme.DARK, "dark"],
  [ColorScheme.HIGH_CONTRAST, "forced-colors"]
]);

// A theme dictionary that lacks a key fails the lookup when that theme is in
// use, so every name needs a value outside @media, or one for light and dark both.
function reportIncompleteVariables(translator: Translator) {
  const declarations = Map.groupBy(translator.variables, variable => variable.name);
  for (const [name, variables] of declarations) {
    const schemes = new Set(variables.map(variable => variable.scheme));
    const hasDefault = schemes.has(ColorScheme.DEFAULT);
    const hasBothThemes = schemes.has(ColorScheme.LIGHT) && schemes.has(ColorScheme.DARK);
    const isComplete = hasDefault || hasBothThemes;
    const [first] = variables;
    const isReportable = !isComplete && first !== undefined;
    if (isReportable) {
      const words = [...schemes].map(scheme => SCHEME_WORDS.get(scheme));
      reportDeclarationProblem({
        translator,
        at: first.at,
        message: `${name} is declared for ${words.join(" and ")} only; declare it outside @media too (the default value)`
      });
    }
  }
}

function buildVariableResources(translator: Translator) {
  const entries = translator.variables.flatMap(variable => variableEntries({
    variable,
    catalogue: translator.input.resources,
    reportProblem: message => reportDeclarationProblem({
      translator,
      at: variable.at,
      message
    })
  }));
  for (const entry of entries) {
    translator.kinds.set(entry.key, entry.kind);
  }

  reportIncompleteVariables(translator);

  const isVariablesMissing = translator.variables.length === 0;
  if (isVariablesMissing) {
    return null;
  }

  return resourceDictionaryXaml(entries.map(entryOf));
}

// Lowering every rule alone finds what has no WinUI meaning before the app runs.
function validateRules({ translator, catalogue }: {
  translator: Translator;
  catalogue: ResourceCatalogue;
}) {
  for (const rule of translator.rules) {
    const options: LowerOptions = {
      elementType: rule.elementType,
      resolveVariable({ declaration, name, kind }) {
        const resolution = resolveVariable({
          catalogue,
          name,
          kind
        });
        if (resolution.isFound) {
          declaration.resource = resolution.key;
        }

        return resolution;
      },
      hasStyle: key => hasStyle({
        catalogue,
        key
      }),
      report: ({ severity, message, position }) => report({
        translator,
        severity,
        message,
        position
      })
    };
    const expanded = rule.declarations.flatMap(declaration => expandDeclaration({
      declaration,
      options
    }));
    rule.declarations = expanded;
    lowerDeclarations({
      computed: computeDeclarations({
        matched: [rule],
        inline: []
      }),
      options,
      extraGroups: gradientGroups()
    });
  }
}

/**
 * Translates a component's compiled CSS into its rules, the XAML of its
 * custom properties, and a diagnostic for everything WinUI cannot say.
 */
export function translateStyleSheet(input: TranslateInput) {
  const translator: Translator = {
    input,
    mapPosition: createPositionMapper(input.map),
    diagnostics: [],
    variables: [],
    kinds: new Map(),
    rules: [],
    nextOrder: 0
  };
  try {
    addBlocks({
      translator,
      blocks: parseCss(input.css),
      scheme: ColorScheme.DEFAULT
    });
  } catch (error) {
    if (!(error instanceof CssSyntaxError)) {
      throw error;
    }

    reportError({
      translator,
      message: error.message,
      generatedAt: error.position
    });
  }

  const resourcesXaml = buildVariableResources(translator);
  validateRules({
    translator,
    catalogue: input.resources.extend(translator.kinds)
  });
  return {
    sheet: {
      id: input.file,
      rules: translator.rules,
      resourcesXaml
    } satisfies StyleSheetData,
    diagnostics: translator.diagnostics
  };
}

/** One diagnostic as a line of build output: `file:line:column: message`. */
export function formatDiagnostic(diagnostic: Diagnostic) {
  const prefix = `${diagnostic.file}:${diagnostic.at.line}:${diagnostic.at.column}:`;
  return diagnostic.severity === "error" ? `${prefix} ${diagnostic.message}` : `${prefix} warning: ${diagnostic.message}`;
}

/** The error diagnostics of a translation. */
export function errorsOf(translation: Translation) {
  return translation.diagnostics.filter(diagnostic => diagnostic.severity === "error");
}
