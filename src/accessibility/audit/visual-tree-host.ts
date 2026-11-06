import type { AuditHost } from "./audit-tree.ts";
import { rgbaOfBrush } from "./contrast.ts";
import {
  AutomationControlType,
  Border,
  Control,
  FrameworkElement,
  Panel,
  SolidColorBrush,
  TextBlock,
  UIElement,
  Visibility,
  VisualTreeHelper
} from "#src/components/generated/bindings.js";
import type { DependencyObject } from "#src/components/generated/bindings.js";
import type { NativeValue } from "#src/native-value.js";
import { projectAs, releaseProjected } from "#winui/lifetime";
import type { AutomationPeer } from "#winui/microsoft/ui/xaml/automation/peers/AutomationPeer";
import {
  FrameworkElementAutomationPeer
} from "#winui/microsoft/ui/xaml/automation/peers/FrameworkElementAutomationPeer";

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_WEIGHT = 400;

const NO_PEER_FACTS = {
  className: "Element",
  controlType: "Group",
  name: "",
  automationId: "",
  hasLabeledBy: false,
  accessKey: "",
  isEnabled: true,
  isKeyboardFocusable: false
};

const controlTypeNames = new Map<NativeValue, string>(
  Object.entries(AutomationControlType).map(([name, value]) => [value, name])
);

interface ProjectedType<T extends object> {
  readonly prototype: T;
}

// A cast to a class the element is not throws; the audit asks "is it one" for
// the panels, borders and controls whose colours it reads.
function projectedOrNull<T extends object>({ value, type }: {
  value: object;
  type: ProjectedType<T>;
}) {
  try {
    return projectAs(value, type);
  } catch {
    return null;
  }
}

function solidColor(brush: object | null) {
  const isBrushMissing = brush === null;
  if (isBrushMissing) {
    return null;
  }

  const solid = projectedOrNull({
    value: brush,
    type: SolidColorBrush
  });
  const isSolid = solid !== null;
  return isSolid ? rgbaOfBrush(solid) : null;
}

// Foreground, background and font of what carries them: text, controls, panels and borders.
function appearanceOf(element: DependencyObject) {
  const text = projectedOrNull({
    value: element,
    type: TextBlock
  });
  const isText = text !== null;
  if (isText) {
    return {
      foreground: solidColor(text.foreground),
      background: null,
      fontSize: text.fontSize,
      fontWeight: text.fontWeight.weight
    };
  }

  const control = projectedOrNull({
    value: element,
    type: Control
  });
  const isControl = control !== null;
  if (isControl) {
    return {
      foreground: solidColor(control.foreground),
      background: solidColor(control.background),
      fontSize: control.fontSize,
      fontWeight: control.fontWeight.weight
    };
  }

  const surface = projectedOrNull({
    value: element,
    type: Panel
  }) ?? projectedOrNull({
    value: element,
    type: Border
  });
  return {
    foreground: null,
    background: surface === null ? null : solidColor(surface.background),
    fontSize: DEFAULT_FONT_SIZE,
    fontWeight: DEFAULT_FONT_WEIGHT
  };
}

function peerOf(element: UIElement) {
  const existing = FrameworkElementAutomationPeer.fromElement(element);
  return existing ?? FrameworkElementAutomationPeer.createPeerForElement(element);
}

/** What UI Automation says of an element; a layout panel has no peer, and says nothing. */
function automationFactsOf(peer: AutomationPeer | null) {
  const isPeerMissing = peer == null;
  if (isPeerMissing) {
    return NO_PEER_FACTS;
  }

  return {
    className: peer.getClassName(),
    controlType: controlTypeNames.get(peer.getAutomationControlType()) ?? "Custom",
    name: peer.getName(),
    automationId: peer.getAutomationId(),
    hasLabeledBy: peer.getLabeledBy() != null,
    accessKey: peer.getAccessKey(),
    isEnabled: peer.isEnabled(),
    isKeyboardFocusable: peer.isKeyboardFocusable()
  };
}

/** What UI Automation and the element's brushes say of one element; null for a collapsed one. */
function factsOf(element: DependencyObject) {
  const visual = projectAs(element, UIElement);
  const framework = projectAs(element, FrameworkElement);
  try {
    const isCollapsed = visual.visibility === Visibility.Collapsed;
    if (isCollapsed) {
      return null;
    }

    return {
      ...automationFactsOf(peerOf(visual)),
      isTabStop: visual.isTabStop,
      hasAccelerator: (visual.keyboardAccelerators?.size ?? 0) > 0,
      width: framework.actualWidth,
      height: framework.actualHeight,
      ...appearanceOf(element)
    };
  } finally {
    releaseProjected(visual);
    releaseProjected(framework);
  }
}

/** The visual children of an element. */
function childrenOf(element: DependencyObject) {
  const children: DependencyObject[] = [];
  for (let i = 0; i < VisualTreeHelper.getChildrenCount(element); i++) {
    children.push(VisualTreeHelper.getChild(element, i));
  }

  return children;
}

/** The audit's view of a live visual tree. */
export const visualTreeHost: AuditHost<DependencyObject> = {
  childrenOf,
  describe: factsOf
};
