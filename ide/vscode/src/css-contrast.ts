import { colorChannelsOf, hexOfChannels } from "./css-color.ts";
import type { CssDeclaration } from "./css-scan.ts";

export const ContrastVerdict = {
  AAA: "AAA",
  AA: "AA",
  AA_LARGE: "AA large",
  FAIL: "fail"
} as const;
export type ContrastVerdict = (typeof ContrastVerdict)[keyof typeof ContrastVerdict];

interface Channels {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

const FOREGROUND = "color";
const BACKGROUNDS = new Set(["background-color", "background"]);
const BYTE = 255;
const LINEAR_THRESHOLD = 0.03928;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA_EXPONENT = 2.4;
const RED_WEIGHT = 0.2126;
const GREEN_WEIGHT = 0.7152;
const BLUE_WEIGHT = 0.0722;
const FLARE = 0.05;
const AAA_RATIO = 7;
const AA_RATIO = 4.5;
const AA_LARGE_RATIO = 3;
const RATIO_TENTHS = 10;
const WHITE = {
  red: BYTE,
  green: BYTE,
  blue: BYTE,
  alpha: 1
};

function linear(channel: number) {
  const unit = channel / BYTE;
  const isDark = unit <= LINEAR_THRESHOLD;
  return isDark ? unit / LINEAR_DIVISOR : ((unit + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA_EXPONENT;
}

function luminanceOf({ red, green, blue }: Channels) {
  return RED_WEIGHT * linear(red) + GREEN_WEIGHT * linear(green) + BLUE_WEIGHT * linear(blue);
}

function mixed({ upper, lower, alpha }: {
  upper: number;
  lower: number;
  alpha: number;
}) {
  return upper * alpha + lower * (1 - alpha);
}

function over({ top, below }: {
  top: Channels;
  below: Channels;
}) {
  return {
    red: mixed({
      upper: top.red,
      lower: below.red,
      alpha: top.alpha
    }),
    green: mixed({
      upper: top.green,
      lower: below.green,
      alpha: top.alpha
    }),
    blue: mixed({
      upper: top.blue,
      lower: below.blue,
      alpha: top.alpha
    }),
    alpha: 1
  };
}

/**
 * The WCAG 2 contrast ratio between a foreground and a background color, from 1 to 21. A translucent background
 * is seen over white, and a translucent foreground over that background.
 */
export function contrastRatio({ foreground, background }: {
  foreground: Channels;
  background: Channels;
}) {
  const ground = over({
    top: background,
    below: WHITE
  });
  const text = over({
    top: foreground,
    below: ground
  });
  const [lighter = 0, darker = 0] = [luminanceOf(text), luminanceOf(ground)].toSorted((left, right) => right - left);
  return (lighter + FLARE) / (darker + FLARE);
}

/**
 * The WCAG level a ratio reaches: AAA from 7, AA from 4.5, AA for large text from 3.
 */
export function verdictOf(ratio: number) {
  const isAaa = ratio >= AAA_RATIO;
  if (isAaa) {
    return ContrastVerdict.AAA;
  }

  const isAa = ratio >= AA_RATIO;
  if (isAa) {
    return ContrastVerdict.AA;
  }

  return ratio >= AA_LARGE_RATIO ? ContrastVerdict.AA_LARGE : ContrastVerdict.FAIL;
}

/**
 * The ratio as a reader sees it, cut (never rounded up) to a tenth: `4.8:1`.
 */
export function ratioText(ratio: number) {
  return `${(Math.floor(ratio * RATIO_TENTHS) / RATIO_TENTHS).toFixed(1)}:1`;
}

function colored(declaration: CssDeclaration) {
  return {
    declaration,
    channels: colorChannelsOf(declaration.value)
  };
}

function isColored(entry: { channels: Channels | undefined }) {
  return entry.channels !== undefined;
}

/**
 * The contrast of the foreground and the background colors one rule or one tag declares, or undefined when it
 * declares only one of them (or one that is not a plain color).
 */
export function contrastOfGroup(group: CssDeclaration[]) {
  const foreground = group.filter(declaration => declaration.property === FOREGROUND).map(colored).findLast(isColored);
  const backgrounds = group.filter(declaration => BACKGROUNDS.has(declaration.property));
  const background = backgrounds.map(colored).findLast(isColored);
  const foregroundChannels = foreground?.channels;
  const backgroundChannels = background?.channels;
  const isIncomplete = foreground === undefined || background === undefined
    || foregroundChannels === undefined || backgroundChannels === undefined;
  if (isIncomplete) {
    return undefined;
  }

  const ratio = contrastRatio({
    foreground: foregroundChannels,
    background: backgroundChannels
  });
  return {
    foreground: foreground.declaration,
    background: background.declaration,
    foregroundHex: hexOfChannels(foregroundChannels),
    backgroundHex: hexOfChannels(backgroundChannels),
    ratio,
    verdict: verdictOf(ratio),
    label: `${ratioText(ratio)} ${verdictOf(ratio)}`
  };
}
