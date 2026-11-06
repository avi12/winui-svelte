import { auditTree } from "./audit-tree.ts";
import { visualTreeHost } from "./visual-tree-host.ts";
import type { DependencyObject } from "#src/components/generated/bindings.js";

export { accessibilityRules, ruleDescriptions } from "./rules.ts";
export type { AccessibilityRule, AccessibilityRuleId, AuditNode } from "./rules.ts";
export { auditTree } from "./audit-tree.ts";
export type { AccessibilityFinding, AuditHost, ElementFacts } from "./audit-tree.ts";
export { AA_CONTRAST, contrastRatio, parseRgba } from "./contrast.ts";
export type { Rgba } from "./contrast.ts";

/**
 * Checks a live visual tree for what a screen reader or a keyboard user would
 * trip on: a button with no name, an input with no label, duplicate access
 * keys, a focusable element with no size, a control the keyboard cannot reach
 * and text below WCAG AA contrast. For development; a production bundle never
 * imports this entry. Run it after the window has laid out (the sizes are
 * zero before), for example from `onloaded`.
 *
 * @param root - The element to start from, usually the window's content.
 * @returns The findings, in tree order; empty when the tree passes.
 */
export function auditAccessibility(root: DependencyObject) {
  return auditTree({
    root,
    host: visualTreeHost
  });
}
