import type { LoweredStyle } from "./properties.ts";
import { ColorScheme } from "./types.ts";
import type { Declaration, PseudoState, ResourceEntry, Rule } from "./types.ts";

/**
 * CSS's cascade for one element: which rules apply to it (its type, classes
 * and current states), in what order, and the XAML Style that results. Pure:
 * the runtime hands the result to XamlReader.
 */
export interface RankedRule {
  rule: Rule;
  /** Names the rule across sheets, for caching what it styles. */
  id: string;
  /** The order across sheets: a rule registered later ranks higher. */
  rank: number;
}

/** What the cascade knows about an element when it picks the rules that style it. */
export interface ElementFacts {
  elementType: string;
  classes: ReadonlySet<string>;
  states: ReadonlySet<PseudoState>;
}

/** The XML namespaces every XAML document the runtime hands to XamlReader declares. */
export const XAML_NAMESPACES = "xmlns=\"http://schemas.microsoft.com/winfx/2006/xaml/presentation\" xmlns:x=\"http://schemas.microsoft.com/winfx/2006/xaml\"";

const XML_ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ["\"", "&quot;"]
]);

function ruleApplies({ rule, facts, isStateIgnored }: {
  rule: Rule;
  facts: ElementFacts;
  isStateIgnored: boolean;
}) {
  const isTypeMatch = rule.elementType === null || rule.elementType === facts.elementType;
  const hasClasses = rule.classes.every(name => facts.classes.has(name));
  const isStateActive = rule.state === null || isStateIgnored || facts.states.has(rule.state);
  return isTypeMatch && hasClasses && isStateActive;
}

/**
 * The rules that style the element, lowest priority first. With
 * `isStateIgnored`, a state rule counts whether or not its state is active:
 * that is how the runtime learns which events an element needs.
 */
export function matchingRanked({ rules, facts, isStateIgnored = false }: {
  rules: readonly RankedRule[];
  facts: ElementFacts;
  isStateIgnored?: boolean;
}) {
  return rules
    .filter(ranked => ruleApplies({
      rule: ranked.rule,
      facts,
      isStateIgnored
    }))
    .sort((first, second) => first.rule.specificity - second.rule.specificity || first.rank - second.rank);
}

/** The same rules as `matchingRanked`, without their ranks. */
export function matchingRules({ rules, facts, isStateIgnored = false }: {
  rules: readonly RankedRule[];
  facts: ElementFacts;
  isStateIgnored?: boolean;
}) {
  return matchingRanked({
    rules,
    facts,
    isStateIgnored
  }).map(ranked => ranked.rule);
}

/**
 * The declarations that win for an element: later ones win, `!important`
 * ones win over every other, and the element's own `style` declarations
 * come last.
 */
export function computeDeclarations({ matched, inline }: {
  matched: readonly Rule[];
  inline: readonly Declaration[];
}) {
  const normal = new Map<string, Declaration>();
  const important = new Map<string, Declaration>();
  const declarations = [...matched.flatMap(rule => rule.declarations), ...inline];
  for (const declaration of declarations) {
    (declaration.isImportant ? important : normal).set(declaration.property, declaration);
  }

  return new Map([...normal, ...important]);
}

/**
 * Resolves a `var()` for the runtime, which does not know WinUI's resource
 * names: the build wrote the key each `var()` resolved to on its declaration.
 */
export function resolveBuiltVariable({ declaration, name }: {
  declaration: Declaration;
  name: string;
}) {
  const { resource } = declaration;
  const isResourceMissing = resource === undefined;
  if (isResourceMissing) {
    return {
      isFound: false,
      reason: `${name} was not resolved at build time (var() works in a <style> block, not in a style attribute)`
    } as const;
  }

  return {
    isFound: true,
    key: resource
  } as const;
}

function escapeAttribute(value: string) {
  return value.replace(/[&<>"]/gu, character => XML_ESCAPES.get(character) ?? character);
}

/** "stack-panel" as StackPanel, the XAML name of the control. */
export function xamlTypeName(elementType: string) {
  return elementType.split("-").map(word => `${word.charAt(0).toUpperCase()}${word.slice(1)}`).join("");
}

/** The XAML of a Style for one element type, from what a rule set lowered to. */
export function styleXaml({ key, elementType, lowered }: {
  key: string;
  elementType: string;
  lowered: LoweredStyle;
}) {
  const basedOn = lowered.basedOn === null ? "" : ` BasedOn="{StaticResource ${lowered.basedOn}}"`;
  const setters = lowered.setters.map(entry => {
    const isSetter = entry.kind === "setter";
    if (isSetter) {
      return `  <Setter Property="${entry.property}" Value="${escapeAttribute(entry.value)}"/>`;
    }

    return `  <Setter Property="${entry.property}"><Setter.Value>${entry.xaml}</Setter.Value></Setter>`;
  });
  return [
    `<Style x:Key="${escapeAttribute(key)}" TargetType="${xamlTypeName(elementType)}"${basedOn}>`,
    ...setters,
    "</Style>"
  ].join("\n");
}

/** A dictionary that holds one style, as XamlReader loads it. */
export function styleDictionaryXaml({ key, elementType, lowered }: {
  key: string;
  elementType: string;
  lowered: LoweredStyle;
}) {
  return `<ResourceDictionary ${XAML_NAMESPACES}>\n${styleXaml({
    key,
    elementType,
    lowered
  })}\n</ResourceDictionary>`;
}

const THEMES = [ColorScheme.LIGHT, ColorScheme.DARK, ColorScheme.HIGH_CONTRAST];

// A key's xaml per scheme: a later entry of the same scheme and key replaces an earlier one.
function xamlByScheme(entries: readonly ResourceEntry[]) {
  const byScheme = new Map<ColorScheme, Map<string, string>>();
  for (const entry of entries) {
    const forScheme = byScheme.get(entry.scheme) ?? new Map<string, string>();
    forScheme.set(entry.key, entry.xaml);
    byScheme.set(entry.scheme, forScheme);
  }

  return byScheme;
}

/**
 * The XAML of a ResourceDictionary holding `entries` in the theme dictionaries
 * of their schemes. Entries for the default scheme alone make a "Default"
 * dictionary. Once any entry names a theme, WinUI's advice holds (a "Default"
 * beside a "HighContrast" lets the light and dark parts of an app change each
 * other's brushes): there are explicit "Light", "Dark" and "HighContrast"
 * dictionaries, each the default entries with its own over them. A lookup that
 * finds no dictionary for the theme in use (high contrast, say) would fail.
 */
export function resourceDictionaryXaml(entries: readonly ResourceEntry[]) {
  const byScheme = xamlByScheme(entries);
  const defaults = byScheme.get(ColorScheme.DEFAULT) ?? new Map<string, string>();
  const isDefaultOnly = byScheme.size === 1 && byScheme.has(ColorScheme.DEFAULT);
  const schemes = isDefaultOnly ? [ColorScheme.DEFAULT] : THEMES;
  const dictionaries = schemes.flatMap(scheme => {
    const merged = new Map([...defaults, ...byScheme.get(scheme) ?? []]);
    const isEmpty = merged.size === 0;
    if (isEmpty) {
      return [];
    }

    return [`<ResourceDictionary x:Key="${scheme}">\n${[...merged.values()].join("\n")}\n</ResourceDictionary>`];
  });
  return `<ResourceDictionary ${XAML_NAMESPACES}>\n<ResourceDictionary.ThemeDictionaries>\n${dictionaries.join("\n")}\n</ResourceDictionary.ThemeDictionaries>\n</ResourceDictionary>`;
}
