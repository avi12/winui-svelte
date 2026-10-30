// The closed sets of strings the Canvas 2D API takes, each as an as-const
// object and its union, with the one function that reads a member.

export const LineCap = {
  BUTT: "butt",
  ROUND: "round",
  SQUARE: "square"
} as const;
/** The end of a line: `butt`, `round` or `square`. */
export type LineCap = typeof LineCap[keyof typeof LineCap];

export const LineJoin = {
  MITER: "miter",
  ROUND: "round",
  BEVEL: "bevel"
} as const;
/** The corner of a line: `miter`, `round` or `bevel`. */
export type LineJoin = typeof LineJoin[keyof typeof LineJoin];

export const FillRule = {
  NONZERO: "nonzero",
  EVENODD: "evenodd"
} as const;
/** Which regions a self-crossing path fills: `nonzero` or `evenodd`. */
export type FillRule = typeof FillRule[keyof typeof FillRule];

export const TextAlign = {
  START: "start",
  END: "end",
  LEFT: "left",
  RIGHT: "right",
  CENTER: "center"
} as const;
/** Where text sits horizontally around its point. */
export type TextAlign = typeof TextAlign[keyof typeof TextAlign];

export const TextBaseline = {
  TOP: "top",
  HANGING: "hanging",
  MIDDLE: "middle",
  ALPHABETIC: "alphabetic",
  IDEOGRAPHIC: "ideographic",
  BOTTOM: "bottom"
} as const;
/** Where text sits vertically around its point. */
export type TextBaseline = typeof TextBaseline[keyof typeof TextBaseline];

export const TextDirection = {
  LTR: "ltr",
  RTL: "rtl",
  INHERIT: "inherit"
} as const;
/** The direction text reads. */
export type TextDirection = typeof TextDirection[keyof typeof TextDirection];

export const ImageSmoothingQuality = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high"
} as const;
/** How well scaled images are smoothed. */
export type ImageSmoothingQuality = typeof ImageSmoothingQuality[keyof typeof ImageSmoothingQuality];

export const Repetition = {
  REPEAT: "repeat",
  REPEAT_X: "repeat-x",
  REPEAT_Y: "repeat-y",
  NO_REPEAT: "no-repeat"
} as const;
/** How a pattern repeats its image. */
export type Repetition = typeof Repetition[keyof typeof Repetition];

export const CompositeOperation = {
  SOURCE_OVER: "source-over",
  SOURCE_IN: "source-in",
  SOURCE_OUT: "source-out",
  SOURCE_ATOP: "source-atop",
  DESTINATION_OVER: "destination-over",
  DESTINATION_IN: "destination-in",
  DESTINATION_OUT: "destination-out",
  DESTINATION_ATOP: "destination-atop",
  LIGHTER: "lighter",
  COPY: "copy",
  XOR: "xor"
} as const;
/** How a shape combines with what is drawn (the Porter-Duff operations Win2D has, and `lighter`). */
export type CompositeOperation = typeof CompositeOperation[keyof typeof CompositeOperation];

/** The member of a closed set that a value equals, or undefined. */
export function memberOf<T extends string>({ set, value }: {
  set: Readonly<Record<string, T>>;
  value: unknown;
}) {
  return Object.values(set).find(member => member === value);
}

/** The fill rule a value names; the nonzero rule when it names none. */
export function fillRuleOf(value: unknown) {
  return memberOf({
    set: FillRule,
    value
  }) ?? FillRule.NONZERO;
}
