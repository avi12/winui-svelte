import type { LoweredStyle } from "./properties.ts";
import type { Declaration, PseudoState, Rule } from "./types.ts";
import { mediaMatches } from "#src/css/parse/media.js";
import type { Viewport } from "#src/css/parse/media.js";

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
  /** Whether the element is still in its starting state, which the `@starting-style` rules style. */
  isStarting?: boolean;
  /** The window's content size, or null where it is unknown: a rule under an @media then does not apply. */
  viewport?: Viewport | null;
}

/** The namespace XAML's controls, templates and styles are written in. */
export const PRESENTATION_NAMESPACE = "http://schemas.microsoft.com/winfx/2006/xaml/presentation";

/** The namespace of XAML's own keywords (`x:Key`, `x:Name`). */
export const XAML_NAMESPACE = "http://schemas.microsoft.com/winfx/2006/xaml";

/** The XML namespaces every XAML document the runtime hands to XamlReader declares. */
export const XAML_NAMESPACES = `xmlns="${PRESENTATION_NAMESPACE}" xmlns:x="${XAML_NAMESPACE}"`;

const XML_ESCAPES = new Map([
  ["&", "&amp;"],
  ["<", "&lt;"],
  [">", "&gt;"],
  ["\"", "&quot;"]
]);

// A rule outside every layer beats the layered ones.
function layerOf(ranked: RankedRule) {
  return ranked.rule.layer ?? Number.POSITIVE_INFINITY;
}

function ruleApplies({ rule, facts, isStateIgnored, isMediaIgnored }: {
  rule: Rule;
  facts: ElementFacts;
  isStateIgnored: boolean;
  isMediaIgnored: boolean;
}) {
  const isTypeMatch = rule.elementType === null || rule.elementType === facts.elementType;
  const hasClasses = rule.classes.every(name => facts.classes.has(name));
  const hasNoExcluded = (rule.notClasses ?? []).every(name => !facts.classes.has(name));
  const isStateActive = rule.state === null || isStateIgnored || facts.states.has(rule.state);
  const isMediaActive = rule.media === undefined || isMediaIgnored || mediaMatches({
    media: rule.media,
    viewport: facts.viewport ?? null
  });
  const isStartingActive = rule.startingStyle === undefined || facts.isStarting === true;
  return isTypeMatch && hasClasses && hasNoExcluded && isStateActive && isMediaActive && isStartingActive;
}

/**
 * The rules that style the element, lowest priority first. With
 * `isStateIgnored`, a state rule counts whether or not its state is active:
 * that is how the runtime learns which events an element needs; with
 * `isMediaIgnored`, so does a rule under an @media, whatever the window's size.
 */
export function matchingRanked({ rules, facts, isStateIgnored = false, isMediaIgnored = false }: {
  rules: readonly RankedRule[];
  facts: ElementFacts;
  isStateIgnored?: boolean;
  isMediaIgnored?: boolean;
}) {
  return rules
    .filter(ranked => ruleApplies({
      rule: ranked.rule,
      facts,
      isStateIgnored,
      isMediaIgnored
    }))
    .sort((first, second) => (
      layerOf(first) - layerOf(second)
      || first.rule.specificity - second.rule.specificity
      || first.rank - second.rank
    ));
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
