/**
 * The words every part of the CSS translation shares. Nothing here imports
 * WinUI: the translation runs in Node at build time and in tests.
 */

/** A 1-based line and column in a source file. */
export interface SourcePosition {
  line: number;
  column: number;
}

/** How bad a problem is: an error fails the build, a warning does not. */
export type Severity = "error" | "warning";

/** A problem found while translating a stylesheet. */
export interface Diagnostic {
  severity: Severity;
  message: string;
  file: string;
  at: SourcePosition;
}

/** One `property: value` pair of a rule or a `style` attribute. */
export interface Declaration {
  /** Lower case; a custom property keeps its `--` prefix. */
  property: string;
  value: string;
  isImportant: boolean;
  at: SourcePosition;
  /**
   * For a value that is a `var(--name)`: the WinUI resource key it resolved
   * to at build time, spelled exactly as WinUI spells it.
   */
  resource?: string;
}

/**
 * The states WinUI's controls report through events. Each is a flag the
 * runtime keeps per element and matches against a rule's `state`.
 */
export const PseudoState = {
  HOVER: "hover",
  ACTIVE: "active",
  FOCUS: "focus",
  FOCUS_VISIBLE: "focus-visible",
  DISABLED: "disabled",
  CHECKED: "checked"
} as const;

/** One of the states in `PseudoState`. */
export type PseudoState = (typeof PseudoState)[keyof typeof PseudoState];

/**
 * The color schemes a custom property can be declared for. Each is the key of a
 * theme dictionary, which is where WinUI looks a ThemeResource up.
 */
export const ColorScheme = {
  DEFAULT: "Default",
  LIGHT: "Light",
  DARK: "Dark"
} as const;

/** One of the schemes in `ColorScheme`. */
export type ColorScheme = (typeof ColorScheme)[keyof typeof ColorScheme];

/** One resource a custom property defines, as the XAML element that goes in a theme dictionary. */
export interface ResourceEntry {
  scheme: ColorScheme;
  /** The resource key; a later entry of the same scheme and key replaces an earlier one. */
  key: string;
  xaml: string;
}

/**
 * One compound selector with its declarations. A selector list is several
 * rules; a rule is data, so a sheet is JSON.
 */
export interface Rule {
  /** "text-block", or null when the selector names no element type. */
  elementType: string | null;
  classes: string[];
  state: PseudoState | null;
  /** Classes plus pseudo-class plus one for a type, as in CSS (`:where()` is 0). */
  specificity: number;
  /** Source order across the whole sheet. */
  order: number;
  declarations: Declaration[];
  /**
   * The custom properties declared in this rule: resources set on each element
   * it matches (and so seen by the element's children), where `:root` sets
   * them for the whole app.
   */
  resources: ResourceEntry[];
}

/** A component's stylesheet as data. */
export interface StyleSheetData {
  /** The component's file: registering the same id again replaces the sheet. */
  id: string;
  rules: Rule[];
  /** A XAML ResourceDictionary of the sheet's `:root` custom properties, or null. */
  resourcesXaml: string | null;
}

/** What translating a component's CSS produced. */
export interface Translation {
  sheet: StyleSheetData;
  diagnostics: Diagnostic[];
}
