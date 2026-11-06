/** The CSS property that picks how a `box-shadow` is drawn. */
export const SHADOW_MODE = "-winui-shadow";

/**
 * How a `box-shadow` is drawn: by a ThemeShadow (its depth only) or by a
 * Composition DropShadow (its colour, offset, blur and spread).
 */
export const ShadowMode = {
  THEME: "theme",
  COMPOSITION: "composition"
} as const;

/** One of the `ShadowMode` values. */
export type ShadowMode = typeof ShadowMode[keyof typeof ShadowMode];

/** The CSS property that puts an element in a shadow group as a receiver of the ThemeShadows cast on the group. */
export const SHADOW_RECEIVER = "-winui-shadow-receiver";

/** The CSS property that makes the element's ThemeShadow fall on the receivers of a shadow group. */
export const SHADOW_CAST_ON = "-winui-shadow-cast-on";

/** Which side of a shadow group an element is. */
export const ShadowRole = {
  CASTER: "caster",
  RECEIVER: "receiver"
} as const;

/** One of the `ShadowRole` values. */
export type ShadowRole = typeof ShadowRole[keyof typeof ShadowRole];
