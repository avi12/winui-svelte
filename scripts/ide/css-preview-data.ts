import { easingKeywords, parseEasing } from "#src/css/translate/easing.js";
import { unsupportedReasonEntries } from "#src/css/translate/unsupported-properties.js";

// The tables the CSS previews of both editors draw: the named easings, the
// shadow depths WinUI uses and the properties that have no WinUI meaning.

// A ThemeShadow draws from how far the element is lifted: 16 for a card and 32
// for a flyout (surface-properties.ts), 4 for a raised control and 128 for a dialog.
const SHADOW_DEPTHS = [
  {
    depth: 4,
    use: "a raised control"
  },
  {
    depth: 16,
    use: "a card"
  },
  {
    depth: 32,
    use: "a flyout"
  },
  {
    depth: 128,
    use: "a dialog"
  }
];

/** The easing keywords as the editors draw them: a bezier's control points or a steps function. */
export function easingData() {
  return easingKeywords().flatMap(name => {
    const easing = parseEasing(name);
    const isUnknown = easing === null;
    if (isUnknown) {
      return [];
    }

    const isSteps = easing.kind === "steps";
    if (isSteps) {
      return [{
        name,
        kind: easing.kind,
        count: easing.count,
        jump: easing.jump
      }];
    }

    return [{
      name,
      kind: easing.kind,
      points: [easing.x1, easing.y1, easing.x2, easing.y2]
    }];
  });
}

/** The shadow depths with what each is for, shallow to deep. */
export function shadowDepthData() {
  return SHADOW_DEPTHS;
}

/** The properties without a WinUI meaning and the reason, in name order. */
export function unsupportedPropertyData() {
  return unsupportedReasonEntries().map(([name, reason]) => ({
    name,
    reason
  }));
}
