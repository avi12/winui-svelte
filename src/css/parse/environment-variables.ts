// CSS `env()`: the safe-area insets of a window are zero (a window is a
// rectangle, with no notch), and `titlebar-area-*` come from the custom title
// bar at run time (dynamic-length.ts).

const SAFE_AREA = /env\(\s*safe-area-inset-(?:top|right|bottom|left)\s*(?:,[^()]*)?\)/giu;

/** Replaces each `env(safe-area-inset-*)` by `0px`. */
export function replaceSafeAreaInsets(value: string) {
  return value.replaceAll(SAFE_AREA, "0px");
}
