import type { ElementEnvironment } from "./environment.ts";
import { parseInlineStyle } from "./inline.ts";
import type { ElementQueries } from "./queries.ts";
import type { Viewport } from "#src/css/parse/media.js";
import type { LowerOptions } from "#src/css/parse/reader.js";
import type { RankedRule } from "#src/css/translate/cascade.js";
import {
  computeDeclarations,
  matchingRanked,
  resolveBuiltVariable,
  styleDictionaryXaml,
  xamlTypeName
} from "#src/css/translate/cascade.js";
import type { LoweredStyle } from "#src/css/translate/properties.js";
import { lowerDeclarations } from "#src/css/translate/properties.js";
import type { PropertyGroup, WriteSeam } from "#src/css/translate/property-kit.js";
import { COMPOSITION_PROPERTIES, RESOURCES_TARGET, XAML_SEPARATOR } from "#src/css/translate/property-kit.js";
import type { Declaration, Keyframes, Rule, StyleSheetData } from "#src/css/translate/types.js";
import { PseudoState } from "#src/css/translate/types.js";
import type { NativeValue } from "#src/native-value.js";

let createQueries: ((input: ConstructorParameters<typeof ElementQueries>[0]) => ElementQueries) | null = null;

/**
 * Gives the runtime the media, container and starting-style queries. The
 * `queries` property group calls it, so a window whose sheets use none carries
 * none of it.
 */
export function provideQueries(factory: NonNullable<typeof createQueries>) {
  createQueries = factory;
}

/** The element whose rules the visual states of a templated control are given each time they are matched. */
export interface StateElement {
  readonly control: object;
  readonly elementType: string;
  /** Whether a rule's `@media` and `@container` conditions hold now; null when the sheets have none. */
  readonly queries: ElementQueries | null;
}

/**
 * What the runtime does to drive the visual states of a templated control:
 * takes the rules it draws out of the ones the Style is built from, and
 * returns the rest (null when it drives nothing of this element).
 */
export interface VisualStates {
  /** The rules that match the element, state rules included; returns the rest. */

  drive(element: StateElement, rules: RankedRule[], seam: WriteSeam): RankedRule[] | null;
}

let visualStates: VisualStates | null = null;

/**
 * Gives the runtime the visual states of a templated control. The
 * `visual-states` subpath calls it, so a window whose sheets have no
 * `:hover` or `:active` rule that sets a brush carries none of it.
 */
export function provideVisualStates(provided: VisualStates) {
  visualStates = provided;
}

type EnvironmentInput = Omit<ConstructorParameters<typeof ElementEnvironment>[0], "store">;

let createEnvironment: ((input: EnvironmentInput) => ElementEnvironment) | null = null;

/**
 * Gives the runtime the `@media` terms beyond the window's size. The
 * `environment` property group calls it, so a window whose sheets ask none
 * carries none of it.
 */
export function provideEnvironment(factory: NonNullable<typeof createEnvironment>) {
  createEnvironment = factory;
}

/** Makes the environment of one element, once the sheets that need it have been loaded; null before. */
export function environmentOf(input: EnvironmentInput) {
  return createEnvironment?.(input) ?? null;
}

/**
 * What the CSS runtime needs of WinUI. Nothing in the runtime imports WinUI:
 * it reaches the controls through this seam (`native.ts` is the one
 * implementation), so the logic runs under `node --test`.
 */
export interface CssNative extends WriteSeam {
  mergeIntoApplication(dictionary: object): void;
  lookupStyle(dictionary: object, key: string): object;
  /** Whether the application's resources (merged dictionaries included) hold `key`. */
  hasApplicationResource(key: string): boolean;
  setStyle(control: object, style: object | null): void;
  /** The size of the window content the control is in, in px; null while it is in none. */
  viewportOf(control: object): Viewport | null;
  /** Calls `handler` when that size changes (or the control gets into a window); null if it cannot be watched. */
  watchViewport(control: object, handler: () => void): (() => void) | null;
}

/**
 * The CSS runtime's handle on one element: it matches the stylesheets'
 * rules by type, classes and states (CSS's cascade), builds the WinUI Style
 * the result calls for, and keeps it in step as classes, states and the
 * sheets themselves change (hot reload).
 */
export interface StyledElement {
  /** The whole class attribute, on every change. */
  setClasses(classNames: string): void;
  /**
   * The whole style attribute, which Svelte keeps as one string whether it
   * was written as style="..." or as style:name={value}; null removes it.
   */
  setInlineStyle(cssText: string | null): void;
  dispose(): void;
}

const RANK_STRIDE = 100_000;
const KEYBOARD_FOCUS = 2;
const CACHE_LIMIT = 2000;
const ID_SEPARATOR = "#";
// Each Style is loaded in a dictionary of its own, so one key does for all.
const STYLE_RESOURCE_KEY = "css-style";
const classSeparator = /\s+/u;

interface StyledElementInput {
  control: object;
  elementType: string;
  /** Writes the element's text again (the renderer's own sync of it), for a `text-transform` that came or went. */
  refreshText: () => void;
}

type ReadProperty = (property: string) => NativeValue;

interface StateBinding {
  event: string;
  isActive(read: ReadProperty): boolean;
}

interface StateSupport {
  bindings: StateBinding[];
  initially?(read: ReadProperty): boolean;
}

function isAlways() {
  return true;
}

function isNever() {
  return false;
}

// The WinUI events that say a control is in a state. A control handles some
// pointer events itself (a Button marks PointerPressed handled), so `:active`
// only works on controls that leave them to the tree.
const stateSupport: ReadonlyMap<PseudoState, StateSupport> = new Map<PseudoState, StateSupport>([
  [PseudoState.HOVER, {
    bindings: [
      {
        event: "PointerEntered",
        isActive: isAlways
      },
      {
        event: "PointerExited",
        isActive: isNever
      }
    ]
  }],
  [PseudoState.ACTIVE, {
    bindings: [
      {
        event: "PointerPressed",
        isActive: isAlways
      },
      {
        event: "PointerReleased",
        isActive: isNever
      },
      {
        event: "PointerCanceled",
        isActive: isNever
      },
      {
        event: "PointerCaptureLost",
        isActive: isNever
      }
    ]
  }],
  [PseudoState.FOCUS, {
    bindings: [
      {
        event: "GotFocus",
        isActive: isAlways
      },
      {
        event: "LostFocus",
        isActive: isNever
      }
    ]
  }],
  [PseudoState.FOCUS_VISIBLE, {
    bindings: [
      {
        event: "GotFocus",
        isActive: read => read("focusState") === KEYBOARD_FOCUS
      },
      {
        event: "LostFocus",
        isActive: isNever
      }
    ]
  }],
  [PseudoState.DISABLED, {
    bindings: [{
      event: "IsEnabledChanged",
      isActive: read => read("isEnabled") === false
    }],
    initially: read => read("isEnabled") === false
  }],
  [PseudoState.CHECKED, {
    bindings: [
      {
        event: "Checked",
        isActive: isAlways
      },
      {
        event: "Unchecked",
        isActive: isNever
      },
      {
        event: "Toggled",
        isActive: read => read("isOn") === true
      }
    ],
    initially: read => read("isChecked") === true || read("isOn") === true
  }]
]);

interface BuiltStyle {
  style: object | null;
  writes: LoweredStyle["writes"];
}

interface RegisteredSheet {
  sheet: StyleSheetData;
  /** Keeps its place in the cascade when a hot reload replaces it. */
  sequence: number;
  /** Counts the times the sheet was registered, to tell its rules from the ones it replaced. */
  version: number;
}

const sheets = new Map<string, RegisteredSheet>();
const elements = new Set<ElementStyle>();
const builtStyles = new Map<string, BuiltStyle>();
const warned = new Set<string>();
const stylesByXaml = new Map<string, object>();
// Each element type's Default<Type>Style, or null where WinUI has none.
const defaultStyles = new Map<string, string | null>();
// The groups beyond the built-in ones that sheets have opted into, by member.
export const extraGroups = new Map<string, PropertyGroup>();
// The `@keyframes` of every sheet, by name (a later sheet's replaces an earlier one's).
let keyframesByName = new Map<string, Keyframes>();
let keyframesSignature = "";
let keyframesVersion = 0;
let native: CssNative | null = null;
let rules: RankedRule[] = [];
let nextSequence = 0;

// WinUI gives a control its Fluent look through an implicit style based on
// Default<Type>Style. A Style set on the control replaces that implicit one, so
// a Style that names no base builds on it: a class adds to the control's look,
// as CSS does, instead of dropping it (a ToggleSwitch lost its MinWidth of 0).
function defaultStyleOf({ currentNative, elementType }: {
  currentNative: CssNative;
  elementType: string;
}) {
  const known = defaultStyles.get(elementType);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const key = `Default${xamlTypeName(elementType)}Style`;
  const found = currentNative.hasApplicationResource(key) ? key : null;
  defaultStyles.set(elementType, found);
  return found;
}

function warnOnce(message: string) {
  if (!warned.has(message)) {
    warned.add(message);
    process.stderr.write(`winui-svelte css: ${message}\n`);
  }
}

// The id of the sheet a rule's id names.
function sheetIdOf(id: string) {
  return id.slice(0, id.lastIndexOf(ID_SEPARATOR));
}

/** A rule's id with its sheet's version, to tell it from the same rule of a sheet a hot reload replaced. */
export function versionedId(id: string) {
  return `${id}@${sheets.get(sheetIdOf(id))?.version ?? 0}`;
}

function rebuildRules() {
  rules = [...sheets.values()].flatMap(({ sheet, sequence }) => sheet.rules.map(rule => ({
    rule,
    id: `${sheet.id}${ID_SEPARATOR}${rule.order}`,
    rank: sequence * RANK_STRIDE + rule.order
  })));
  builtStyles.clear();
  const declared = [...sheets.values()].flatMap(({ sheet }) => sheet.keyframes);
  keyframesByName = new Map(declared.map(keyframes => [keyframes.name, keyframes] as const));
  const signature = JSON.stringify([...keyframesByName.values()]);
  const isChanged = signature !== keyframesSignature;
  if (isChanged) {
    keyframesSignature = signature;
    keyframesVersion++;
  }
}

function mergeResources(registered: RegisteredSheet) {
  const xaml = registered.sheet.resourcesXaml;
  const currentNative = native;
  const canMerge = currentNative !== null && xaml !== null;
  if (!canMerge) {
    return;
  }

  currentNative.mergeIntoApplication(currentNative.loadDictionary(xaml));
}

function refreshAll() {
  for (const element of elements) {
    element.refresh();
  }
}

/**
 * Opts into property groups the built-in ones leave out (a gradient
 * background, a transform, an outline: each costs a parser): a sheet that needs
 * one registers it before the sheet. The same group again changes nothing.
 */
export function registerPropertyGroups(groups: readonly PropertyGroup[]) {
  for (const group of groups) {
    const [member = ""] = group.members;
    extraGroups.set(member, group);
  }
}

// The rules' custom properties are resources of the element, merged for the
// lowest priority first: the last dictionary merged wins a key.
function resourceWrites(matched: readonly RankedRule[]) {
  const xamls = matched.flatMap(({ rule }) => rule.resourcesXaml ?? []);
  return xamls.length === 0 ? [] : [{
    target: RESOURCES_TARGET,
    value: xamls.join(XAML_SEPARATOR)
  }];
}

// What a group beyond the built-in ones registered to apply a write.
function writeHandler(target: string) {
  return [...extraGroups.values()].map(group => group.writes?.[target]).find(handler => handler !== undefined);
}

/**
 * Registers a translated stylesheet. The same id replaces the sheet (hot
 * reload): its custom properties are merged again after the old ones, so
 * they win, and every live element re-applies.
 */
export function registerStyleSheet(sheet: StyleSheetData) {
  const previous = sheets.get(sheet.id);
  const registered: RegisteredSheet = {
    sheet,
    sequence: previous?.sequence ?? nextSequence++,
    version: (previous?.version ?? 0) + 1
  };
  sheets.set(sheet.id, registered);
  rebuildRules();
  mergeResources(registered);
  refreshAll();
}

/** Removes a stylesheet, and every live element re-applies. */
export function unregisterStyleSheet(id: string) {
  sheets.delete(id);
  rebuildRules();
  refreshAll();
}

/**
 * Connects the runtime to WinUI. Called once, after Application.create has
 * installed WinUI's own resources: sheets registered before it (component
 * modules load first) are merged now.
 */
export function installCssRuntime(implementation: CssNative) {
  native = implementation;
  for (const registered of sheets.values()) {
    mergeResources(registered);
  }

  builtStyles.clear();
  stylesByXaml.clear();
  refreshAll();
}

/** What lowering declarations for an element type needs: variables, keyframes and where problems go. */
export function lowerOptions({ elementType, problems }: {
  elementType: string;
  problems: string[];
}) {
  const options: LowerOptions = {
    elementType,
    resolveVariable: resolveBuiltVariable,
    keyframes: {
      find: name => keyframesByName.get(name),
      isComplete: true
    },
    // The build checked every -winui-based-on against WinUI's styles.
    hasStyle: isAlways,
    report({ severity, message, position }) {
      const isError = severity === "error";
      if (isError) {
        problems.push(`${message} (${position.line}:${position.column})`);
      } else {
        warnOnce(message);
      }
    }
  };
  return options;
}

const SCOPE_CLASS = /^svelte-/u;

// A rule as an author wrote it, for an error: the sheet's file and line, the
// selector, and the properties it sets.
function describeRule(ranked: RankedRule) {
  const { rule } = ranked;
  const file = sheetIdOf(ranked.id);
  const line = rule.declarations[0]?.at.line ?? 0;
  const classes = rule.classes.filter(name => !SCOPE_CLASS.test(name)).map(name => `.${name}`);
  const state = rule.state === null ? "" : `:${rule.state}`;
  const selector = `${rule.elementType ?? ""}${classes.join("")}${state}`;
  const properties = rule.declarations.map(declaration => declaration.property).join(", ");
  return `${file}:${line} ${selector || "*"} { ${properties} }`;
}

/** The rules as an author wrote them, for an error. */
export function describeRules(matched: readonly RankedRule[]) {
  return matched.length === 0 ? "its style attribute" : matched.map(describeRule).join("; ");
}

function buildStyle({ elementType, matched, inline }: {
  elementType: string;
  matched: RankedRule[];
  inline: Declaration[];
}) {
  const currentNative = native;
  const isNativeMissing = currentNative === null;
  if (isNativeMissing) {
    throw new Error("installCss has not been called");
  }

  const problems: string[] = [];
  const lowered = lowerDeclarations({
    computed: computeDeclarations({
      matched: matched.map(ranked => ranked.rule),
      inline
    }),
    options: lowerOptions({
      elementType,
      problems
    }),
    extraGroups: [...extraGroups.values()]
  });
  const hasProblems = problems.length > 0;
  if (hasProblems) {
    throw new Error(`<${elementType}> cannot take the style of ${describeRules(matched)}: ${problems.join("; ")}`);
  }

  const isEmpty = lowered.setters.length === 0 && lowered.basedOn === null;
  if (isEmpty) {
    return {
      style: null,
      writes: lowered.writes
    };
  }

  // The same XAML is the same Style object, so a hot reload that left an
  // element's declarations as they were does not set a new one on it.
  const based = {
    ...lowered,
    basedOn: lowered.basedOn ?? defaultStyleOf({
      currentNative,
      elementType
    })
  };
  const xaml = styleDictionaryXaml({
    key: STYLE_RESOURCE_KEY,
    elementType,
    lowered: based
  });
  const known = stylesByXaml.get(xaml);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return {
      style: known,
      writes: lowered.writes
    };
  }

  const style = styleOfXaml({
    currentNative,
    xaml,
    elementType,
    matched
  });
  stylesByXaml.set(xaml, style);
  return {
    style,
    writes: lowered.writes
  };
}

// WinUI refuses a Style whose property the element's type lacks (a font-size
// on a path-icon) with a message that names neither file nor rule.
function styleOfXaml({ currentNative, xaml, elementType, matched }: {
  currentNative: CssNative;
  xaml: string;
  elementType: string;
  matched: readonly RankedRule[];
}) {
  try {
    return currentNative.lookupStyle(currentNative.loadDictionary(xaml), STYLE_RESOURCE_KEY);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`<${elementType}> cannot take the style of ${describeRules(matched)}: ${reason} (a class used on elements of different types needs a rule per type)`, { cause: error });
  }
}

function builtFor({ key, elementType, matched, inline }: {
  key: string;
  elementType: string;
  matched: RankedRule[];
  inline: Declaration[];
}) {
  const known = builtStyles.get(key);
  const hasKnown = known !== undefined;
  if (hasKnown) {
    return known;
  }

  const isCacheFull = builtStyles.size >= CACHE_LIMIT;
  if (isCacheFull) {
    builtStyles.clear();
    stylesByXaml.clear();
  }

  const built = buildStyle({
    elementType,
    matched,
    inline
  });
  builtStyles.set(key, built);
  return built;
}

class ElementStyle implements StyledElement {
  readonly control: object;
  readonly elementType: string;
  private classes = new Set<string>();
  private inlineText: string | null = null;
  private readonly states = new Set<PseudoState>();
  private readonly subscriptions = new Map<PseudoState, Array<() => void>>();
  private appliedKey: string | null = null;
  private appliedStyle: object | null = null;
  queries: ElementQueries | null = null;
  private appliedWrites = "";
  private writeUndos: Array<() => void> = [];
  private isDisposed = false;
  private readonly refreshText: () => void;

  constructor({ control, elementType, refreshText }: StyledElementInput) {
    this.control = control;
    this.elementType = elementType;
    this.refreshText = refreshText;
    elements.add(this);
  }

  setClasses(classNames: string) {
    this.classes = new Set(classNames.split(classSeparator).filter(name => name !== ""));
    this.refresh();
  }

  setInlineStyle(cssText: string | null) {
    const isBlank = cssText === null || cssText.trim() === "";
    this.inlineText = isBlank ? null : cssText;
    this.refresh();
  }

  dispose() {
    this.isDisposed = true;
    elements.delete(this);
    for (const unsubscribers of this.subscriptions.values()) {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    }

    this.subscriptions.clear();
    this.queries?.dispose();
    for (const undo of this.writeUndos) {
      undo();
    }
  }

  private inlineDeclarations() {
    const problems: string[] = [];
    const options = lowerOptions({
      elementType: this.elementType,
      problems
    });
    const declarations = this.inlineText === null ? [] : parseInlineStyle({
      cssText: this.inlineText,
      options,
      extra: new Map([...extraGroups.values()].flatMap(group => [...group.shorthands ?? []]))
    });
    const hasProblems = problems.length > 0;
    if (hasProblems) {
      throw new Error(`<${this.elementType}> style: ${problems.join("; ")}`);
    }

    return declarations;
  }

  refresh() {
    const currentNative = native;
    const canRefresh = currentNative !== null && !this.isDisposed;
    if (!canRefresh) {
      return;
    }

    this.queries ??= createQueries?.({
      control: this.control,
      native: currentNative,
      refresh: () => {
        this.refresh();
      }
    }) ?? null;
    const every = matchingRanked({
      rules,
      facts: {
        elementType: this.elementType,
        classes: this.classes,
        states: this.states,
        isStarting: this.queries?.isSettled === false
      },
      isStateIgnored: true,
      isMediaIgnored: true
    });
    const candidates = visualStates?.drive(this, every, currentNative) ?? every;
    this.syncStates(new Set(candidates.flatMap(({ rule }) => rule.state ?? [])));
    this.queries?.sync(every.map(({ rule }) => rule));
    const matched = candidates.filter(({ rule }) => this.isRuleActive(rule));
    const inline = this.inlineDeclarations();
    const inlineKey = inline.map(({ property, value }) => `${property}:${value}`).join(";");
    const isAnimated = [...matched.flatMap(({ rule }) => rule.declarations), ...inline].some(({ property }) => property === "animation-name");
    // The key carries each rule's sheet version, so an element is restyled
    // only when a sheet it matches was replaced.
    const key = [this.elementType, ...matched.map(({ id }) => versionedId(id)), inlineKey, isAnimated ? keyframesVersion : ""].join("|");
    const isKeyApplied = key === this.appliedKey;
    if (isKeyApplied) {
      return;
    }

    const isUnstyled = matched.length === 0 && inline.length === 0;
    const hasAppliedStyle = this.appliedKey !== null;
    const isStillUnstyled = isUnstyled && !hasAppliedStyle;
    if (isStillUnstyled) {
      return;
    }

    const built = builtFor({
      key,
      elementType: this.elementType,
      matched,
      inline
    });
    const isStyleApplied = built.style === this.appliedStyle;
    if (!isStyleApplied) {
      currentNative.setStyle(this.control, built.style);
      this.appliedStyle = built.style;
    }

    this.applyWrites({
      currentNative,
      writes: [...built.writes, ...resourceWrites(matched)]
    });
    this.appliedKey = isUnstyled ? null : key;
  }

  private applyWrites({ currentNative, writes }: {
    currentNative: CssNative;
    writes: Array<{
      target: string;
      value: string;
    }>;
  }) {
    const signature = writes.map(({ target, value }) => `${target}=${value}`).join(";");
    const isSignatureApplied = signature === this.appliedWrites;
    if (isSignatureApplied) {
      return;
    }

    for (const undo of this.writeUndos) {
      undo();
    }

    this.writeUndos = writes.flatMap(({ target, value }) => {
      const isGrid = target === "columns" || target === "rows";
      if (isGrid) {
        currentNative.setGridDefinitions(this.control, target, value);
        return [];
      }

      const isComposition = COMPOSITION_PROPERTIES.has(target);
      if (isComposition) {
        return [currentNative.setComposition({
          control: this.control,
          property: target,
          value
        })];
      }

      const undo = writeHandler(target)?.({
        control: this.control,
        value,
        native: currentNative,
        refreshText: this.refreshText
      });
      return undo ? [undo] : [];
    });
    this.appliedWrites = signature;
  }

  private isRuleActive(rule: Rule) {
    const isStateActive = rule.state === null || this.states.has(rule.state);
    return isStateActive && (this.queries?.isMediaActive(rule) ?? true);
  }

  private readProperty: ReadProperty = property => (native === null ? undefined : native.read({
    control: this.control,
    property
  }));

  // Listens for exactly the states some matching rule asks about.
  private syncStates(wanted: Set<PseudoState>) {
    for (const [state, unsubscribers] of this.subscriptions) {
      if (!wanted.has(state)) {
        for (const unsubscribe of unsubscribers) {
          unsubscribe();
        }

        this.subscriptions.delete(state);
        this.states.delete(state);
      }
    }

    for (const state of wanted) {
      if (!this.subscriptions.has(state)) {
        this.subscribeTo(state);
      }
    }
  }

  private subscribeTo(state: PseudoState) {
    const support = stateSupport.get(state);
    const currentNative = native;
    const canSubscribe = currentNative !== null && support !== undefined;
    if (!canSubscribe) {
      return;
    }

    const unsubscribers: Array<() => void> = [];
    for (const binding of support.bindings) {
      const unsubscribe = currentNative.subscribe(this.control, binding.event, () => {
        const isActive = binding.isActive(this.readProperty);
        const isChanged = isActive !== this.states.has(state);
        if (isActive) {
          this.states.add(state);
        } else {
          this.states.delete(state);
        }

        if (isChanged) {
          this.refresh();
        }
      });
      const hasUnsubscribe = unsubscribe !== null;
      if (hasUnsubscribe) {
        unsubscribers.push(unsubscribe);
      }
    }

    const hasNoSubscriptions = unsubscribers.length === 0;
    if (hasNoSubscriptions) {
      warnOnce(`:${state} on <${this.elementType}> does nothing: the control reports none of ${support.bindings.map(binding => binding.event).join(", ")}`);
    }

    this.subscriptions.set(state, unsubscribers);

    const isInitiallySupported = support.initially?.(this.readProperty) === true;
    if (isInitiallySupported) {
      this.states.add(state);
    }
  }
}

/**
 * The Style the rules of these classes make for an element type, for a prop
 * that takes a Style (`itemContainerStyle="row"`) rather than an element it
 * styles: the one an element of that type and class would get, without
 * states. Null when no rule applies. The Style is built when this is called,
 * so a sheet registered later does not change it.
 *
 * @throws {Error} When a rule sets something only an element can hold (a
 * grid's columns, the focus ring, a custom property): a Style cannot.
 */
export function styleOfClasses({ elementType, classNames }: {
  elementType: string;
  classNames: string;
}) {
  const classes = new Set(classNames.split(classSeparator).filter(name => name !== ""));
  const matched = matchingRanked({
    rules,
    facts: {
      elementType,
      classes,
      states: new Set()
    }
  });
  const isUnstyled = matched.length === 0;
  if (isUnstyled) {
    return null;
  }

  const built = builtFor({
    key: [elementType, ...matched.map(({ id }) => versionedId(id)), ""].join("|"),
    elementType,
    matched,
    inline: []
  });
  const writes = [...built.writes, ...resourceWrites(matched)];
  const hasWrites = writes.length > 0;
  if (hasWrites) {
    throw new Error(
      `"${classNames}" sets ${writes.map(write => write.target).join(", ")}, which an element holds and a Style does not`
    );
  }

  return built.style;
}

/** One per element the renderer creates that is given class, style or style:. */
export function styledElement(input: StyledElementInput) {
  return new ElementStyle(input);
}
