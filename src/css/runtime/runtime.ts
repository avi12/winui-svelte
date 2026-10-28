import { parseInlineStyle } from "./inline.ts";
import type { LowerOptions } from "#src/css/parse/reader.js";
import type { RankedRule } from "#src/css/translate/cascade.js";
import {
  computeDeclarations,
  matchingRanked,
  resolveBuiltVariable,
  resourceDictionaryXaml,
  styleDictionaryXaml,
  xamlTypeName
} from "#src/css/translate/cascade.js";
import type { LoweredStyle } from "#src/css/translate/properties.js";
import { lowerDeclarations } from "#src/css/translate/properties.js";
import type { PropertyGroup } from "#src/css/translate/property-kit.js";
import type { OriginPoint } from "#src/css/translate/transform-origin.js";
import { resolveTransformOrigin } from "#src/css/translate/transform-origin.js";
import type { Declaration, StyleSheetData } from "#src/css/translate/types.js";
import { PseudoState } from "#src/css/translate/types.js";
import type { NativeValue } from "#src/native-value.js";

/**
 * What the CSS runtime needs of WinUI. Nothing in the runtime imports WinUI:
 * it reaches the controls through this seam (`native.ts` is the one
 * implementation), so the logic runs under `node --test`.
 */
export interface CssNative {
  /** XamlReader.load of a ResourceDictionary. */
  loadDictionary(xaml: string): object;
  mergeIntoApplication(dictionary: object): void;
  /** Merges a dictionary into the control's own Resources (its template reads them); returns what undoes it. */
  mergeIntoControl(control: object, dictionary: object): () => void;
  lookupStyle(dictionary: object, key: string): object;
  /** Whether the application's resources (merged dictionaries included) hold `key`. */
  hasApplicationResource(key: string): boolean;
  setStyle(control: object, style: object | null): void;
  /** A grid's columns or rows, from "Auto,*,2*,120" (empty clears them). */
  setGridDefinitions(control: object, target: "columns" | "rows", lengths: string): void;
  /** UIElement.CenterPoint: the point Scale and Rotation pivot about. */
  setCenterPoint(control: object, point: OriginPoint): void;
  /** Control.UseSystemFocusVisuals, so the focus visual draws; nothing where a type lacks it. */
  useSystemFocusVisuals(control: object): void;
  /** Calls `handler` on a WinUI event (PointerEntered...); null if the control has no such event. */
  subscribe(control: object, event: string, handler: () => void): (() => void) | null;
  read(input: {
    control: object;
    property: string;
  }): NativeValue;
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
const extraGroups = new Map<string, PropertyGroup>();
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

// A rule's id and its sheet's version, to tell it from the rule of the same
// name in the sheet a hot reload replaced.
function versionedId(id: string) {
  const sheetId = id.slice(0, id.lastIndexOf(ID_SEPARATOR));
  return `${id}@${sheets.get(sheetId)?.version ?? 0}`;
}

function rebuildRules() {
  rules = [...sheets.values()].flatMap(({ sheet, sequence }) => sheet.rules.map(rule => ({
    rule,
    id: `${sheet.id}${ID_SEPARATOR}${rule.order}`,
    rank: sequence * RANK_STRIDE + rule.order
  })));
  builtStyles.clear();
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
 * background, which costs a parser): a sheet that needs one registers it
 * before the sheet. The same group again changes nothing.
 */
export function registerPropertyGroups(groups: readonly PropertyGroup[]) {
  for (const group of groups) {
    const [member = ""] = group.members;
    extraGroups.set(member, group);
  }
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

function lowerOptions({ elementType, problems }: {
  elementType: string;
  problems: string[];
}) {
  const options: LowerOptions = {
    elementType,
    resolveVariable: resolveBuiltVariable,
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
    const where = matched.map(ranked => ranked.id).join(", ");
    throw new Error(`<${elementType}> cannot take the style of ${where === "" ? "its style attribute" : where}: ${problems.join("; ")}`);
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

  const style = currentNative.lookupStyle(currentNative.loadDictionary(xaml), STYLE_RESOURCE_KEY);
  stylesByXaml.set(xaml, style);
  return {
    style,
    writes: lowered.writes
  };
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
  private readonly control: object;
  private readonly elementType: string;
  private classes = new Set<string>();
  private inlineText: string | null = null;
  private readonly states = new Set<PseudoState>();
  private readonly subscriptions = new Map<PseudoState, Array<() => void>>();
  private appliedKey: string | null = null;
  private appliedStyle: object | null = null;
  private appliedWrites = "";
  private stopFollowingSize: (() => void) | null = null;
  private appliedResources: string | null = null;
  private removeResources: (() => void) | null = null;
  private isDisposed = false;

  constructor(control: object, elementType: string) {
    this.control = control;
    this.elementType = elementType;
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
    this.stopFollowingSize?.();
    this.stopFollowingSize = null;
    this.removeResources?.();
    this.removeResources = null;
  }

  private inlineDeclarations() {
    const problems: string[] = [];
    const options = lowerOptions({
      elementType: this.elementType,
      problems
    });
    const declarations = this.inlineText === null ? [] : parseInlineStyle({
      cssText: this.inlineText,
      options
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

    const candidates = matchingRanked({
      rules,
      facts: {
        elementType: this.elementType,
        classes: this.classes,
        states: this.states
      },
      isStateIgnored: true
    });
    this.syncStates(new Set(candidates.flatMap(({ rule }) => (rule.state === null ? [] : [rule.state]))));
    const matched = candidates.filter(({ rule }) => rule.state === null || this.states.has(rule.state));
    const inline = this.inlineDeclarations();
    const inlineKey = inline.map(({ property, value }) => `${property}:${value}`).join(";");
    // The key carries each rule's sheet version, so an element is restyled
    // only when a sheet it matches was replaced.
    const key = [this.elementType, ...matched.map(({ id }) => versionedId(id)), inlineKey].join("|");
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

    this.applyResources({
      currentNative,
      matched
    });
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
      built
    });
    this.appliedKey = isUnstyled ? null : key;
  }

  // The custom properties of the rules that match, as the element's own
  // resources: a dictionary per element, since WinUI keeps one to a parent.
  private applyResources({ currentNative, matched }: {
    currentNative: CssNative;
    matched: RankedRule[];
  }) {
    const entries = matched.flatMap(({ rule }) => rule.resources);
    const hasEntries = entries.length > 0;
    const xaml = hasEntries ? resourceDictionaryXaml(entries) : null;
    const isResourcesApplied = xaml === this.appliedResources;
    if (isResourcesApplied) {
      return;
    }

    this.removeResources?.();
    this.removeResources = xaml === null ? null : currentNative.mergeIntoControl(
      this.control,
      currentNative.loadDictionary(xaml)
    );
    this.appliedResources = xaml;
  }

  private applyWrites({ currentNative, built }: {
    currentNative: CssNative;
    built: BuiltStyle;
  }) {
    const signature = built.writes.map(write => `${write.target}=${write.value}`).join(";");
    const isSignatureApplied = signature === this.appliedWrites;
    if (isSignatureApplied) {
      return;
    }

    for (const write of built.writes) {
      this.applyWrite({
        currentNative,
        write
      });
    }

    this.appliedWrites = signature;
  }

  private applyWrite({ currentNative, write }: {
    currentNative: CssNative;
    write: BuiltStyle["writes"][number];
  }) {
    const { target, value } = write;
    const isOrigin = target === "origin";
    if (isOrigin) {
      this.pivotAbout({
        currentNative,
        origin: value
      });
      return;
    }

    const isFocusVisuals = target === "focusVisuals";
    if (isFocusVisuals) {
      currentNative.useSystemFocusVisuals(this.control);
      return;
    }

    currentNative.setGridDefinitions(this.control, target, value);
  }

  // CenterPoint is absolute, so it follows the element as it is laid out.
  private pivotAbout({ currentNative, origin }: {
    currentNative: CssNative;
    origin: string;
  }) {
    this.stopFollowingSize?.();
    const place = () => {
      currentNative.setCenterPoint(
        this.control,
        resolveTransformOrigin({
          value: origin,
          width: Number(this.readProperty("actualWidth") ?? 0),
          height: Number(this.readProperty("actualHeight") ?? 0)
        })
      );
    };
    place();
    this.stopFollowingSize = currentNative.subscribe(this.control, "SizeChanged", place);
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

/** One per element the renderer creates that is given class, style or style:. */
export function styledElement({ control, elementType }: {
  control: object;
  elementType: string;
}) {
  return new ElementStyle(control, elementType);
}
