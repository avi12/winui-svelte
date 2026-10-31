/**
 * The value forms CSS lets be written two ways and the CSS layer takes in one:
 * a share of one and a number say the same thing, so WinUI's native form (a
 * bare number) is the only one accepted. `stylelintRule` and `stylelintValue`
 * are the setting `.stylelintrc.json` must carry for the same form, which a
 * test checks, and `advice` is what the compiler's error says to write.
 */
export const NOTATIONS = {
  alpha: {
    stylelintRule: "alpha-value-notation",
    stylelintValue: "number",
    advice: "write a number from 0 to 1 (0.5, not 50%)"
  },
  lightness: {
    stylelintRule: "lightness-notation",
    stylelintValue: "number",
    advice: "write the lightness as a number (oklch(0.7 ...), not oklch(70% ...))"
  },
  keyframeSelector: {
    stylelintRule: "keyframe-selector-notation",
    stylelintValue: "percentage-unless-within-keyword-only-block",
    advice: "write from, to or a percentage (50%): a percentage here is a share of the animation, not a length"
  }
} as const;
