import { composite, contrastRatio } from "./contrast.ts";
import type { Rgba } from "./contrast.ts";
import { accessibilityRules } from "./rules.ts";
import type { AccessibilityRuleId } from "./rules.ts";

const OPAQUE = 255;
const LARGE_TEXT_SIZE = 24;
const LARGE_BOLD_TEXT_SIZE = 18.66;
const BOLD_WEIGHT = 700;

/** What a host (the real visual tree, or a test's stand-in) tells the audit of one element. */
export interface ElementFacts {
  readonly className: string;
  readonly controlType: string;
  readonly name: string;
  readonly automationId: string;
  readonly hasLabeledBy: boolean;
  readonly accessKey: string;
  readonly isEnabled: boolean;
  readonly isTabStop: boolean;
  readonly isKeyboardFocusable: boolean;
  readonly hasAccelerator: boolean;
  readonly width: number;
  readonly height: number;
  readonly foreground: Rgba | null;
  readonly background: Rgba | null;
  readonly fontSize: number;
  readonly fontWeight: number;
}

/** A visual tree the audit can walk; `null` from `describe` skips the element and what is under it. */
export interface AuditHost<Element extends object> {
  childrenOf(element: Element): readonly Element[];
  describe(element: Element): ElementFacts | null;
}

/** One problem the audit found, with where it is and what to do. */
export interface AccessibilityFinding {
  readonly ruleId: AccessibilityRuleId;
  readonly message: string;
  readonly suggestion: string;
  /** The classes from the root, each with its index among its siblings: `Grid[0]/Button[1]`. */
  readonly path: string;
  readonly className: string;
  readonly automationId: string;
  readonly name: string;
}

interface Visited {
  readonly path: string;
  readonly facts: ElementFacts;
  readonly background: Rgba | null;
}

function isOpaque(color: Rgba | null): color is Rgba {
  return color !== null && color.alpha === OPAQUE;
}

function isLargeText({ fontSize, fontWeight }: ElementFacts) {
  const isLargeBold = fontWeight >= BOLD_WEIGHT && fontSize >= LARGE_BOLD_TEXT_SIZE;
  return fontSize >= LARGE_TEXT_SIZE || isLargeBold;
}

// A translucent background shows as it falls on the one behind it; none is known without a solid one under it.
function backgroundOver({ layer, inherited }: {
  layer: Rgba | null;
  inherited: Rgba | null;
}) {
  const isTransparent = layer === null || layer.alpha === 0;
  if (isTransparent) {
    return inherited;
  }

  if (isOpaque(layer)) {
    return layer;
  }

  return inherited === null ? null : composite({
    top: layer,
    bottom: inherited
  });
}

function contrastOf({ facts, background }: Visited) {
  const { foreground } = facts;
  const isResolvable = isOpaque(foreground) && background !== null;
  return isResolvable ? contrastRatio({
    foreground,
    background
  }) : null;
}

function walk<Element extends object>({ host, element, parent, index, visited }: {
  host: AuditHost<Element>;
  element: Element;
  parent: Visited | null;
  index: number;
  visited: Visited[];
}) {
  const facts = host.describe(element);
  const isSkipped = facts === null;
  if (isSkipped) {
    return;
  }

  const inherited = parent?.background ?? null;
  const own = backgroundOver({
    layer: facts.background,
    inherited
  });
  const prefix = parent === null ? "" : `${parent.path}/`;
  const here = {
    path: `${prefix}${facts.className}[${index}]`,
    facts,
    background: own
  };
  visited.push(here);
  for (const [iChild, child] of host.childrenOf(element).entries()) {
    walk({
      host,
      element: child,
      parent: here,
      index: iChild,
      visited
    });
  }
}

function accessKeyCounts(visited: readonly Visited[]) {
  const counts = new Map<string, number>();
  for (const { facts } of visited) {
    const key = facts.accessKey.toLowerCase();
    const isKeyed = key !== "";
    if (isKeyed) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return counts;
}

function nodeOf({ visited, counts }: {
  visited: Visited;
  counts: ReadonlyMap<string, number>;
}) {
  const { facts } = visited;
  const keyCount = counts.get(facts.accessKey.toLowerCase()) ?? 0;
  return {
    ...facts,
    isAccessKeyDuplicated: keyCount > 1,
    contrast: contrastOf(visited),
    isLargeText: isLargeText(facts)
  };
}

/**
 * Checks a visual tree against the table of rules.
 *
 * @param options - The tree's root and the host that reads it.
 * @returns The findings, in tree order.
 */
export function auditTree<Element extends object>({ root, host }: {
  root: Element;
  host: AuditHost<Element>;
}) {
  const visited: Visited[] = [];
  walk({
    host,
    element: root,
    parent: null,
    index: 0,
    visited
  });
  const counts = accessKeyCounts(visited);
  const findings: AccessibilityFinding[] = [];
  for (const here of visited) {
    const node = nodeOf({
      visited: here,
      counts
    });
    for (const rule of accessibilityRules) {
      const isApplicable = rule.appliesTo.includes(node.controlType);
      const isViolated = isApplicable && rule.isViolated(node);
      if (isViolated) {
        findings.push({
          ruleId: rule.id,
          message: rule.message,
          suggestion: rule.suggestion,
          path: here.path,
          className: node.className,
          automationId: here.facts.automationId,
          name: node.name
        });
      }
    }
  }

  return findings;
}
