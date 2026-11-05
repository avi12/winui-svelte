import { AA_CONTRAST } from "./contrast.ts";

/**
 * What the audit knows of one element of the visual tree: plain data, so a rule
 * is a pure function of it and a test needs no WinUI.
 */
export interface AuditNode {
  /** The WinUI class name UI Automation reports (`Button`, `TextBlock`). */
  readonly className: string;
  /** The `AutomationControlType` name (`Button`, `Edit`, `Text`). */
  readonly controlType: string;
  /** The accessible name a screen reader speaks: `automationName`, else the element's own text, label or header. */
  readonly name: string;
  readonly hasLabeledBy: boolean;
  readonly accessKey: string;
  readonly isEnabled: boolean;
  readonly isTabStop: boolean;
  readonly isKeyboardFocusable: boolean;
  /** Whether a keyboard accelerator reaches the element when it is no tab stop. */
  readonly hasAccelerator: boolean;
  readonly width: number;
  readonly height: number;
  /** Whether another element of the tree has the same access key. */
  readonly isAccessKeyDuplicated: boolean;
  /** The contrast of the text on the solid background behind it, or null when either is not resolvable. */
  readonly contrast: number | null;
  readonly isLargeText: boolean;
}

/** One row of the audit: what it applies to, what is wrong and what to do. */
export interface AccessibilityRule {
  readonly id: string;
  /** The `AutomationControlType` names the rule applies to. */
  readonly appliesTo: readonly string[];
  readonly message: string;
  readonly suggestion: string;
  isViolated(node: AuditNode): boolean;
}

const BUTTONS = ["Button", "SplitButton"];
const INPUTS = ["Edit", "ComboBox", "Slider", "Spinner", "CheckBox", "RadioButton"];
const INTERACTIVE = [...BUTTONS, ...INPUTS, "Hyperlink", "MenuItem", "TabItem", "ListItem", "TreeItem"];
const TEXT_BEARING = ["Text", ...BUTTONS, ...INPUTS];

function minimumContrastOf({ isLargeText }: AuditNode) {
  return isLargeText ? AA_CONTRAST.LARGE_TEXT : AA_CONTRAST.TEXT;
}

/** The one table of rules; `scripts/accessibility/export-audit-rules.ts` writes it as JSON for editors. */
export const accessibilityRules = [
  {
    id: "unnamed-button",
    appliesTo: BUTTONS,
    message: "The button has no accessible name: a screen reader says only \"button\" (an icon-only button has no text to fall back on)",
    suggestion: "Set automationName, or give the button text or a label",
    isViolated: node => node.name === ""
  },
  {
    id: "unlabeled-input",
    appliesTo: INPUTS,
    message: "The input has no label: a screen reader cannot say what to enter",
    suggestion: "Set a header, automationName or automationLabeledBy (an elementRef of the label)",
    isViolated: node => node.name === "" && !node.hasLabeledBy
  },
  {
    id: "duplicate-access-key",
    appliesTo: INTERACTIVE,
    message: "Another element has the same access key: Alt shortcuts reach only one of them",
    suggestion: "Give each element in the window its own accessKey",
    isViolated: node => node.isAccessKeyDuplicated
  },
  {
    id: "zero-size-focusable",
    appliesTo: INTERACTIVE,
    message: "The element takes focus but has no size: keyboard focus lands on nothing visible",
    suggestion: "Give it a width and height, collapse it, or set isTabStop to false",
    isViolated: node => node.isKeyboardFocusable && (node.width === 0 || node.height === 0)
  },
  {
    id: "unreachable-by-keyboard",
    appliesTo: INTERACTIVE,
    message: "The control is no tab stop and has no access key or keyboard accelerator: a keyboard user cannot reach it",
    suggestion: "Set isTabStop to true, or give it an accessKey or a keyboardAccelerator",
    isViolated: node => node.isEnabled && !node.isTabStop && node.accessKey === "" && !node.hasAccelerator
  },
  {
    id: "low-contrast-text",
    appliesTo: TEXT_BEARING,
    message: "The text is below the WCAG AA contrast (4.5 to 1, or 3 to 1 for large text) against its background",
    suggestion: "Use a darker or lighter foreground, or a theme brush",
    isViolated: node => node.contrast !== null && node.contrast < minimumContrastOf(node)
  }
] as const satisfies readonly AccessibilityRule[];

/** The identifier of a rule in the table. */
export type AccessibilityRuleId = (typeof accessibilityRules)[number]["id"];

/**
 * The rule table without its predicates, as an editor reads it.
 *
 * @returns One object per rule: id, appliesTo, message and suggestion.
 */
export function ruleDescriptions() {
  return accessibilityRules.map(({ id, appliesTo, message, suggestion }) => ({
    id,
    appliesTo,
    message,
    suggestion
  }));
}
