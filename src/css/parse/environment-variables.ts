// CSS `env()`: the safe-area insets of a window are zero (a window is a
// rectangle, with no notch). `titlebar-area-*` is known only at run time, and
// WinUI has no run-time lengths, so it stays and is the translator's error.

const SAFE_AREA = /env\(\s*safe-area-inset-(?:top|right|bottom|left)\s*(?:,[^()]*)?\)/giu;

/** Replaces each `env(safe-area-inset-*)` by `0px`. */
export function replaceSafeAreaInsets(value: string) {
  return value.replaceAll(SAFE_AREA, "0px");
}
