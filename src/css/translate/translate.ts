import { computeDeclarations, XAML_NAMESPACES } from "./cascade.ts";
import { lowerDeclarations } from "./properties.ts";
import { expandDeclaration } from "./shorthands.ts";
import type {
  Declaration,
  Diagnostic,
  Rule,
  Severity,
  SourcePosition,
  StyleSheetData,
  Translation
} from "./types.ts";
import { parseColor } from "#src/css/parse/colors.js";
import type { AtRuleBlock, Block, RuleBlock } from "#src/css/parse/parser.js";
import { BlockKind, CssSyntaxError, parseCss } from "#src/css/parse/parser.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import type { ParsedSelector } from "#src/css/parse/selectors.js";
import { parseSelectorList } from "#src/css/parse/selectors.js";
import type { PositionMapper, SourceMapV3 } from "#src/css/parse/source-map.js";
import { createPositionMapper } from "#src/css/parse/source-map.js";
import { parseLength, parseNumber } from "#src/css/parse/values.js";
import type { ResourceCatalogue } from "#src/css/runtime/resources.js";
import { hasStyle, resolveVariable, ResourceKind, resourceNameOf } from "#src/css/runtime/resources.js";

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

const ColorScheme = {
  DEFAULT: "Default",
  DARK: "Dark",
  LIGHT: "Light"
} as const;
type ColorScheme = (typeof ColorScheme)[keyof typeof ColorScheme];

const schemeQuery = /^\(\s*prefers-color-scheme\s*:\s*(dark|light)\s*\)$/iu;

interface Variable {
  name: string;
  value: string;
  scheme: ColorScheme;
  at: SourcePosition;
}

interface Translator {
  input: TranslateInput;
  mapPosition: PositionMapper;
  diagnostics: Diagnostic[];
  variables: Variable[];
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
  const match = block.name === "media" ? schemeQuery.exec(block.prelude) : null;
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    const what = block.name === "media" ? `@media ${block.prelude}` : `@${block.name}`;
    reportError({
      translator,
      message: `${what} has no WinUI meaning (only @media (prefers-color-scheme: dark) and (light) do, for custom properties)`,
      generatedAt: block.at
    });
    return null;
  }

  return match[1]?.toLowerCase() === "dark" ? ColorScheme.DARK : ColorScheme.LIGHT;
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

// One selector of a rule: its custom properties become variables, and its
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
  for (const custom of customProperties) {
    translator.variables.push({
      name: custom.property,
      value: custom.value,
      scheme,
      at: custom.at
    });
  }

  if (selector.isRoot) {
    reportDeclarations({
      translator,
      declarations: properties,
      message: "has no WinUI meaning (:root styles no element; it can only declare custom properties)"
    });
    return;
  }

  const isSchemeConditional = scheme !== ColorScheme.DEFAULT;
  if (isSchemeConditional) {
    reportDeclarations({
      translator,
      declarations: [...properties, ...customProperties],
      message: "has no WinUI meaning here (a Style cannot depend on the color scheme: set the color through var(--a-winui-brush) or declare a custom property on :root in the @media block)"
    });
    return;
  }

  translator.rules.push({
    elementType: selector.elementType,
    classes: selector.classes,
    state: selector.state,
    specificity: selector.specificity,
    order: translator.nextOrder,
    declarations: properties
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

function variableEntries({ variable, reportProblem }: {
  variable: Variable;
  reportProblem(message: string): void;
}) {
  const key = resourceNameOf(variable.name);
  const color = parseColor(variable.value);
  const hasColor = color !== null;
  if (hasColor) {
    return [
      {
        key,
        xaml: `<Color x:Key="${key}">${color}</Color>`,
        kind: ResourceKind.COLOR
      },
      {
        key: `${key}Brush`,
        xaml: `<SolidColorBrush x:Key="${key}Brush" Color="{StaticResource ${key}}"/>`,
        kind: ResourceKind.BRUSH
      }
    ];
  }

  const length = parseLength(variable.value) ?? parseNumber(variable.value);
  const hasLength = length !== null;
  if (hasLength) {
    return [{
      key,
      xaml: `<x:Double x:Key="${key}">${length}</x:Double>`,
      kind: ResourceKind.DOUBLE
    }];
  }

  reportProblem(`${variable.name}: expected a color or a length in px, found "${variable.value}"`);
  return [];
}

function buildVariableResources(translator: Translator) {
  const entriesByScheme = new Map<ColorScheme, Map<string, string>>();
  const kinds = new Map<string, ResourceKind>();
  for (const variable of translator.variables) {
    const entries = variableEntries({
      variable,
      reportProblem: message => translator.diagnostics.push({
        severity: "error",
        message,
        file: translator.input.file,
        at: variable.at
      })
    });
    const forScheme = entriesByScheme.get(variable.scheme) ?? new Map<string, string>();
    for (const entry of entries) {
      forScheme.set(entry.key, entry.xaml);
      kinds.set(entry.key, entry.kind);
    }

    entriesByScheme.set(variable.scheme, forScheme);
  }

  const lightNames = new Set(
    translator.variables.filter(variable => variable.scheme !== ColorScheme.DARK).map(variable => variable.name)
  );
  const reportedNames = new Set<string>();
  for (const variable of translator.variables) {
    const isUnseen = !lightNames.has(variable.name) && !reportedNames.has(variable.name);
    const isDarkOnly = variable.scheme === ColorScheme.DARK && isUnseen;
    if (isDarkOnly) {
      reportedNames.add(variable.name);
      translator.diagnostics.push({
        severity: "error",
        message: `${variable.name} is declared for dark only; declare it outside @media too (the light value)`,
        file: translator.input.file,
        at: variable.at
      });
    }
  }

  const isSchemeMapEmpty = entriesByScheme.size === 0;
  if (isSchemeMapEmpty) {
    return {
      xaml: null,
      kinds
    };
  }

  const dictionaries = [ColorScheme.DEFAULT, ColorScheme.LIGHT, ColorScheme.DARK].flatMap(scheme => {
    const entries = entriesByScheme.get(scheme);
    const isEntriesMissing = entries === undefined;
    if (isEntriesMissing) {
      return [];
    }

    return [`<ResourceDictionary x:Key="${scheme}">\n${[...entries.values()].join("\n")}\n</ResourceDictionary>`];
  });
  return {
    xaml: `<ResourceDictionary ${XAML_NAMESPACES}>\n<ResourceDictionary.ThemeDictionaries>\n${dictionaries.join("\n")}\n</ResourceDictionary.ThemeDictionaries>\n</ResourceDictionary>`,
    kinds
  };
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
      options
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

  const variables = buildVariableResources(translator);
  validateRules({
    translator,
    catalogue: input.resources.extend(variables.kinds)
  });
  return {
    sheet: {
      id: input.file,
      rules: translator.rules,
      resourcesXaml: variables.xaml
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
