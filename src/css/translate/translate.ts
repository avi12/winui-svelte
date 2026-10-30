import { tracksOf } from "./animation-tracks.ts";
import { computeDeclarations } from "./cascade.ts";
import { dynamicPropertyOf } from "./dynamic-length-properties.ts";
import { createLayerOrder, declareLayer, layerRank, withinLayer } from "./layers.ts";
import type { LayerOrder } from "./layers.ts";
import { BUILD_GROUPS, LAZY_GROUPS } from "./lazy-groups.ts";
import { lowerDeclarations } from "./properties.ts";
import { expandDeclaration } from "./shorthands.ts";
import { ColorScheme } from "./types.ts";
import type {
  Declaration,
  Diagnostic,
  Keyframes,
  KeyframeStep,
  ResourceEntry,
  Rule,
  Severity,
  SourcePosition,
  StyleSheetData,
  Translation
} from "./types.ts";
import { unsupportedAtRuleReason, unsupportedReason } from "./unsupported-properties.ts";
import { resourceDictionaryXaml, variableEntries } from "./variables.ts";
import type { Variable, VariableEntry } from "./variables.ts";
import { evaluateCalc } from "#src/css/parse/calc.js";
import { isDynamicLength } from "#src/css/parse/dynamic-length.js";
import { replaceLightDark } from "#src/css/parse/light-dark.js";
import type { MediaCondition } from "#src/css/parse/media.js";
import { parseContainerQuery, parseMediaQuery } from "#src/css/parse/media.js";
import { resolveModernColors } from "#src/css/parse/modern-colors.js";
import type { AtRuleBlock, Block, RuleBlock } from "#src/css/parse/parser.js";
import { BlockKind, CssSyntaxError, parseCss } from "#src/css/parse/parser.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import type { ParsedSelector } from "#src/css/parse/selectors.js";
import { flattenNestedSelector, parseSelectorList } from "#src/css/parse/selectors.js";
import type { PositionMapper, SourceMapV3 } from "#src/css/parse/source-map.js";
import { createPositionMapper } from "#src/css/parse/source-map.js";
import { splitCommas } from "#src/css/parse/split.js";
import { parsePercent, provideCalcFolding } from "#src/css/parse/values.js";
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
  keyframes: Keyframes[];
  nextOrder: number;
  layers: LayerOrder;
  /** Whether the rules being read are inside `@starting-style`. */
  isStartingStyle: boolean;
  /** The layer each rule was written in, turned into its place once the sheet is read. */
  ruleLayers: Map<Rule, string>;
  /** How many `light-dark()` calls were given a custom property of their own. */
  lightDarkCount: number;
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
    const reason = unsupportedAtRuleReason(block.name);
    const advice = reason === "" ? "" : `; ${reason}`;
    reportError({
      translator,
      message: `${what} has no WinUI meaning (only @media (min-width), (max-width), (min-height) and (max-height), which restyle as the window resizes, and, for custom properties, (prefers-color-scheme: dark), (prefers-color-scheme: light) and (forced-colors: active) do)${advice}`,
      generatedAt: block.at
    });
    return null;
  }

  return scheme;
}

// A light-dark() is a custom property of the sheet that has the light value in
// the light theme and the dark one in the dark theme.
function originalDeclaration({ translator, declaration }: {
  translator: Translator;
  declaration: Declaration;
}) {
  const position = translator.mapPosition(declaration.at);
  const dynamic = dynamicPropertyOf(declaration.property);
  const isDynamic = dynamic !== null && isDynamicLength(declaration.value);
  const { value, pairs } = replaceLightDark({
    value: resolveModernColors({ value: declaration.value }),
    nameFor: () => `--light-dark-${translator.lightDarkCount++}`
  });
  for (const { name, light, dark } of pairs) {
    translator.variables.push(
      {
        name,
        value: resolveModernColors({ value: light }),
        scheme: ColorScheme.LIGHT,
        at: position
      },
      {
        name,
        value: resolveModernColors({ value: dark }),
        scheme: ColorScheme.DARK,
        at: position
      }
    );
  }

  return {
    ...declaration,
    property: isDynamic ? dynamic : declaration.property,
    value,
    at: position
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

  return entries.length === 0 ? null : resourceDictionaryXaml(entries.map(entryOf));
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
function addSelectorRule({ translator, block, selector, scheme, media }: {
  translator: Translator;
  block: RuleBlock;
  selector: ParsedSelector;
  scheme: ColorScheme;
  media: MediaCondition | null;
}) {
  const declarations = block.declarations.map(declaration => originalDeclaration({
    translator,
    declaration
  }));
  const customProperties = declarations.filter(declaration => declaration.property.startsWith("--"));
  const properties = declarations.filter(declaration => !declaration.property.startsWith("--"));
  if (selector.isRoot) {
    const isSizeConditional = media !== null;
    if (isSizeConditional) {
      reportDeclarations({
        translator,
        declarations,
        message: "has no WinUI meaning here (a custom property of :root cannot depend on the window's size: put the query around a rule)"
      });
      return;
    }

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

  const resourcesXaml = hasState ? null : scopedResources({
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

  const isUseless = isSchemeConditional && resourcesXaml === null;
  if (isUseless) {
    return;
  }

  const rule: Rule = {
    elementType: selector.elementType,
    classes: selector.classes,
    ...selector.notClasses.length === 0 ? {} : { notClasses: selector.notClasses },
    state: selector.state,
    specificity: selector.specificity,
    order: translator.nextOrder,
    declarations: isSchemeConditional ? [] : properties,
    ...media === null ? {} : { media },
    ...translator.isStartingStyle ? { startingStyle: true as const } : {},
    resourcesXaml
  };
  translator.rules.push(rule);
  const { current } = translator.layers;
  const isLayered = current !== null;
  if (isLayered) {
    translator.ruleLayers.set(rule, current);
  }

  translator.nextOrder++;
}

// A rule inside a nested at-rule, its `&` the selector of the rule around the at-rule.
function withParent({ child, parent }: {
  child: RuleBlock;
  parent: string;
}) {
  return {
    ...child,
    selector: flattenNestedSelector({
      parent,
      child: child.selector
    })
  };
}

function addRuleBlock({ translator, block, scheme, media }: {
  translator: Translator;
  block: RuleBlock;
  scheme: ColorScheme;
  media: MediaCondition | null;
}) {
  for (const result of parseSelectorList(block.selector)) {
    if (result.isValid) {
      addSelectorRule({
        translator,
        block,
        selector: result.selector,
        scheme,
        media
      });
    } else {
      reportError({
        translator,
        message: `selector "${block.selector}": ${result.reason}`,
        generatedAt: block.at
      });
    }
  }

  for (const child of block.nested) {
    addRuleBlock({
      translator,
      block: withParent({
        child,
        parent: block.selector
      }),
      scheme,
      media
    });
  }

  for (const nestedAt of block.nestedAtRules) {
    addAtRule({
      translator,
      block: {
        ...nestedAt,
        children: (nestedAt.children ?? []).map(child => (child.kind === BlockKind.RULE ? withParent({
          child,
          parent: block.selector
        }) : child))
      },
      scheme,
      media
    });
  }
}

// `from`, `to` or a percentage; a keyframe selector is a list of them.
function keyframeOffset(selector: string) {
  const lower = selector.trim().toLowerCase();
  const named = new Map([["from", 0], ["to", 1]]).get(lower);
  const percent = parsePercent(lower);
  const isPercentValid = percent !== null && percent >= 0 && percent <= 1;
  return named ?? (isPercentValid ? percent : null);
}

function keyframeSteps({ translator, blocks }: {
  translator: Translator;
  blocks: Block[];
}) {
  const steps: KeyframeStep[] = [];
  for (const block of blocks) {
    const offsets = block.kind === BlockKind.RULE ? block.selector.split(",").map(keyframeOffset) : [];
    const isValid = block.kind === BlockKind.RULE && offsets.length > 0 && !offsets.includes(null);
    if (!isValid) {
      reportError({
        translator,
        message: "@keyframes holds from, to and percentage keyframes only",
        generatedAt: block.at
      });
      continue;
    }

    const declarations = block.declarations.map(declaration => originalDeclaration({
      translator,
      declaration
    }));
    for (const offset of offsets.filter(each => each !== null)) {
      steps.push({
        offset,
        declarations
      });
    }
  }

  return steps.toSorted((first, second) => first.offset - second.offset);
}

function addKeyframes({ translator, block }: {
  translator: Translator;
  block: AtRuleBlock;
}) {
  const name = block.prelude.trim();
  const isNamed = name !== "" && !name.includes(" ");
  if (!isNamed) {
    reportError({
      translator,
      message: "@keyframes takes one name",
      generatedAt: block.at
    });
    return;
  }

  translator.keyframes.push({
    name,
    steps: keyframeSteps({
      translator,
      blocks: block.children ?? []
    })
  });
}

function addBlocks({ translator, blocks, scheme, media }: {
  translator: Translator;
  blocks: Block[];
  scheme: ColorScheme;
  media: MediaCondition | null;
}) {
  for (const block of blocks) {
    const isRuleBlock = block.kind === BlockKind.RULE;
    if (isRuleBlock) {
      addRuleBlock({
        translator,
        block,
        scheme,
        media
      });
      continue;
    }

    addAtRule({
      translator,
      block,
      scheme,
      media
    });
  }
}

// `@starting-style { ... }`: the rules style the element until its first layout. Its rules
// must not be in a media query: the state an entrance starts from does not change with the size.
function addStartingStyle({ translator, block, scheme, media }: {
  translator: Translator;
  block: AtRuleBlock;
  scheme: ColorScheme;
  media: MediaCondition | null;
}) {
  const { children } = block;
  const isReadable = children !== null && block.prelude.trim() === "" && !translator.isStartingStyle;
  if (!isReadable) {
    reportError({
      translator,
      message: "@starting-style takes a block of rules (or declarations, inside a rule) and cannot nest",
      generatedAt: block.at
    });
    return;
  }

  translator.isStartingStyle = true;
  try {
    addBlocks({
      translator,
      blocks: children,
      scheme,
      media
    });
  } finally {
    translator.isStartingStyle = false;
  }
}

// `@layer a, b;` orders layers; `@layer a { ... }` puts its rules in one.
function addLayer({ translator, block, scheme, media }: {
  translator: Translator;
  block: AtRuleBlock;
  scheme: ColorScheme;
  media: MediaCondition | null;
}) {
  const { children } = block;
  const names = splitCommas(block.prelude).filter(name => name !== "");
  const isStatement = children === null;
  if (isStatement) {
    for (const name of names) {
      declareLayer({
        order: translator.layers,
        name
      });
    }

    return;
  }

  withinLayer({
    order: translator.layers,
    name: names.join(""),
    body() {
      addBlocks({
        translator,
        blocks: children,
        scheme,
        media
      });
    }
  });
}

const PROPERTY_MEMBERS = new Set(["syntax", "inherits", "initial-value"]);

// `@property --x { syntax: "<color>"; inherits: false; initial-value: red }`: the
// initial value is the custom property's value until a rule gives it another. The
// syntax and inheritance have no WinUI meaning: a resource has no type check, and
// a resource is looked up through the tree.
function addProperty({ translator, block }: {
  translator: Translator;
  block: AtRuleBlock;
}) {
  const name = block.prelude.trim();
  const bodies = (block.children ?? []).filter(child => child.kind === BlockKind.RULE);
  const declarations = bodies.flatMap(body => body.declarations);
  for (const declaration of declarations) {
    const isKnown = PROPERTY_MEMBERS.has(declaration.property);
    if (!isKnown) {
      reportDeclarationProblem({
        translator,
        at: translator.mapPosition(declaration.at),
        message: `@property ${name}: ${declaration.property} is not a descriptor (syntax, inherits, initial-value)`
      });
    }
  }

  const initial = declarations.find(declaration => declaration.property === "initial-value");
  const isInitialMissing = initial === undefined;
  if (isInitialMissing) {
    reportError({
      translator,
      message: `@property ${name} needs an initial-value (WinUI resources have no unset state)`,
      generatedAt: block.at
    });
    return;
  }

  translator.variables.unshift({
    name,
    value: resolveModernColors({ value: initial.value }),
    scheme: ColorScheme.DEFAULT,
    at: translator.mapPosition(initial.at)
  });
}

// The bounds an @media (min-width...) or an @container asks for; null for any other at-rule.
function sizeQueryOf(block: AtRuleBlock) {
  const queries = new Map([
    ["media", parseMediaQuery],
    ["container", parseContainerQuery]
  ]);
  return queries.get(block.name)?.(block.prelude) ?? null;
}

function addAtRule({ translator, block, scheme, media }: {
  translator: Translator;
  block: AtRuleBlock;
  scheme: ColorScheme;
  media: MediaCondition | null;
}) {
  const isProperty = block.name === "property";
  if (isProperty) {
    addProperty({
      translator,
      block
    });
    return;
  }

  const isStarting = block.name === "starting-style";
  if (isStarting) {
    addStartingStyle({
      translator,
      block,
      scheme,
      media
    });
    return;
  }

  const isLayer = block.name === "layer";
  if (isLayer) {
    addLayer({
      translator,
      block,
      scheme,
      media
    });
    return;
  }

  const isKeyframes = block.name === "keyframes" && scheme === ColorScheme.DEFAULT && media === null;
  if (isKeyframes) {
    addKeyframes({
      translator,
      block
    });
    return;
  }

  const isNestedMedia = scheme !== ColorScheme.DEFAULT || media !== null;
  const sizeQuery = isNestedMedia ? null : sizeQueryOf(block);
  const { children } = block;
  const isSizeBlock = sizeQuery !== null && children !== null;
  if (isSizeBlock) {
    addBlocks({
      translator,
      blocks: children,
      scheme,
      media: sizeQuery
    });
    return;
  }

  if (isNestedMedia) {
    reportError({
      translator,
      message: `@${block.name} inside @media has no WinUI meaning`,
      generatedAt: block.at
    });
    return;
  }

  const inner = schemeOf({
    translator,
    block
  });
  const canNest = inner !== null && children !== null;
  if (canNest) {
    addBlocks({
      translator,
      blocks: children,
      scheme: inner,
      media
    });
  } else if (inner !== null) {
    reportError({
      translator,
      message: `@${block.name} has no WinUI meaning`,
      generatedAt: block.at
    });
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

const RELATIVE_COLOR = /\(\s*from\s/iu;

// A relative color whose origin is a custom property is resolved once every
// custom property of the sheet is known (it uses the value outside any @media).
function resolveRelativeColors(translator: Translator) {
  const defaults = translator.variables.filter(variable => variable.scheme === ColorScheme.DEFAULT);
  const lookup = new Map(defaults.map(variable => [variable.name, variable.value]));
  for (const variable of translator.variables) {
    variable.value = resolveModernColors({
      value: variable.value,
      lookup
    });
  }

  for (const rule of translator.rules) {
    for (const declaration of rule.declarations) {
      const isRelative = RELATIVE_COLOR.test(declaration.value);
      if (isRelative) {
        declaration.value = resolveModernColors({
          value: declaration.value,
          lookup
        });
      }
    }
  }
}

const CALC_OF_LENGTHS = /^(?:calc|min|max|clamp)\(.*\d(?:px|rem)/iu;

// A calc(), min(), max() or clamp() of px and rem is a plain length in the
// sheet: the app carries no expression evaluator to fold it at run time.
function foldStaticCalc(translator: Translator) {
  for (const rule of translator.rules) {
    for (const declaration of rule.declarations) {
      const isCalcOfLengths = CALC_OF_LENGTHS.test(declaration.value);
      const pixels = isCalcOfLengths ? evaluateCalc(declaration.value) : null;
      const isFolded = pixels !== null;
      if (isFolded) {
        declaration.value = `${pixels}px`;
      }
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

// Every keyframe property must be one WinUI animates, found now rather than when the animation runs.
function validateKeyframes(translator: Translator) {
  for (const keyframes of translator.keyframes) {
    tracksOf({
      keyframes,
      report: ({ message, at }) => report({
        translator,
        severity: "error",
        message,
        position: at
      })
    });
  }
}

// Lowering every rule alone finds what has no WinUI meaning before the app runs.
function validateRules({ translator, catalogue }: {
  translator: Translator;
  catalogue: ResourceCatalogue;
}) {
  const groups = [...LAZY_GROUPS.flatMap(lazy => lazy.groups()), ...BUILD_GROUPS.flatMap(build => build())];
  const shorthands = new Map(groups.flatMap(group => [...group.shorthands ?? []]));
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
      keyframes: {
        find: name => translator.keyframes.findLast(keyframes => keyframes.name === name),
        isComplete: false
      },
      hasStyle: key => hasStyle({
        catalogue,
        key
      }),
      explainUnsupported: unsupportedReason,
      report: ({ severity, message, position }) => report({
        translator,
        severity,
        message,
        position
      })
    };
    const expanded = rule.declarations.flatMap(declaration => expandDeclaration({
      declaration,
      options,
      extra: shorthands
    }));
    rule.declarations = expanded;
    lowerDeclarations({
      computed: computeDeclarations({
        matched: [rule],
        inline: []
      }),
      options,
      extraGroups: groups
    });
  }
}

/**
 * Translates a component's compiled CSS into its rules, the XAML of its
 * custom properties, and a diagnostic for everything WinUI cannot say.
 */
export function translateStyleSheet(input: TranslateInput) {
  provideCalcFolding(evaluateCalc);
  const translator: Translator = {
    input,
    mapPosition: createPositionMapper(input.map),
    diagnostics: [],
    variables: [],
    kinds: new Map(),
    rules: [],
    keyframes: [],
    nextOrder: 0,
    layers: createLayerOrder(),
    isStartingStyle: false,
    ruleLayers: new Map(),
    lightDarkCount: 0
  };
  try {
    addBlocks({
      translator,
      blocks: parseCss(input.css),
      scheme: ColorScheme.DEFAULT,
      media: null
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

  for (const [rule, layer] of translator.ruleLayers) {
    rule.layer = layerRank({
      order: translator.layers,
      name: layer
    });
  }

  resolveRelativeColors(translator);
  foldStaticCalc(translator);
  const resourcesXaml = buildVariableResources(translator);
  validateKeyframes(translator);
  validateRules({
    translator,
    catalogue: input.resources.extend(translator.kinds)
  });
  return {
    sheet: {
      id: input.file,
      rules: translator.rules,
      keyframes: translator.keyframes,
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
