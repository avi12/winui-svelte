import { namedColors } from "./named-colors.ts";
import {
  parseNumber,
  parsePercent,
  splitCommas,
  splitSlash,
  splitWords
} from "./values.ts";

const MAX_CHANNEL = 255;
const HEX_RADIX = 16;
const DEGREES_PER_TURN = 360;
const TRANSPARENT_COLOR = "#00FFFFFF";
const CHANNELS_PER_COLOR = 3;
const SHORT_RGB_LENGTH = 3;
const SHORT_RGBA_LENGTH = 4;
const FULL_RGB_LENGTH = 6;
const FULL_RGBA_LENGTH = 8;
const HUE_SEGMENTS = 6;
const HUE_RAMP_DOWN_SEGMENT = 4;
const HUE_RAMP_DOWN_END = HUE_RAMP_DOWN_SEGMENT / HUE_SEGMENTS;
const MIDDLE_LIGHTNESS = 0.5;

function hex(value: number) {
  return Math.round(Math.min(MAX_CHANNEL, Math.max(0, value))).toString(HEX_RADIX).padStart(2, "0").toUpperCase();
}

// XAML spells a color #AARRGGBB; the alpha is dropped when it is opaque.
function xamlColor({ red, green, blue, alpha }: {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}) {
  const isOpaque = alpha >= 1;
  const alphaPart = isOpaque ? "" : hex(alpha * MAX_CHANNEL);
  return `#${alphaPart}${hex(red)}${hex(green)}${hex(blue)}`;
}

function parseHexColor(token: string) {
  const match = /^#([0-9a-f]{3,8})$/iu.exec(token);
  const digits = match?.[1];
  const isDigitsMissing = digits === undefined;
  if (isDigitsMissing) {
    return null;
  }

  const isShort = digits.length === SHORT_RGB_LENGTH || digits.length === SHORT_RGBA_LENGTH;
  const full = isShort ? digits.split("").map(digit => digit + digit).join("") : digits;
  const isValidLength = full.length === FULL_RGB_LENGTH || full.length === FULL_RGBA_LENGTH;
  if (!isValidLength) {
    return null;
  }

  // CSS writes alpha last (#RRGGBBAA), XAML first.
  const alphaPart = full.length === FULL_RGBA_LENGTH ? full.slice(FULL_RGB_LENGTH) : "";
  return `#${alphaPart}${full.slice(0, FULL_RGB_LENGTH)}`.toUpperCase();
}

function channelValue({ part, scale }: {
  part: string;
  scale: number;
}) {
  const percent = parsePercent(part);
  const hasPercent = percent !== null;
  if (hasPercent) {
    return percent * scale;
  }

  return parseNumber(part);
}

function alphaValue(part: string | undefined) {
  const isPartMissing = part === undefined;
  if (isPartMissing) {
    return 1;
  }

  return parseNumber(part);
}

function parseRgbColor(token: string) {
  const match = /^rgba?\((.*)\)$/iu.exec(token);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const [channels = "", alphaText] = (match[1] ?? "").includes("/")
    ? splitSlash(match[1] ?? "")
    : [match[1] ?? ""];
  const parts = channels.includes(",") ? splitCommas(channels) : splitWords(channels);
  const [redPart = "", greenPart = "", bluePart = "", legacyAlpha] = parts;
  const alpha = alphaValue(alphaText ?? legacyAlpha);
  const red = channelValue({
    part: redPart,
    scale: MAX_CHANNEL
  });
  const green = channelValue({
    part: greenPart,
    scale: MAX_CHANNEL
  });
  const blue = channelValue({
    part: bluePart,
    scale: MAX_CHANNEL
  });
  const hasEveryChannel = red !== null && green !== null && blue !== null && alpha !== null;
  const isValid = hasEveryChannel && parts.length >= CHANNELS_PER_COLOR;
  return isValid ? xamlColor({
    red,
    green,
    blue,
    alpha
  }) : null;
}

// The standard HSL to RGB conversion: `low` and `high` bound the channel, and
// the hue fraction picks its place on the ramp between them.
function hueChannel({ low, high, hueFraction }: {
  low: number;
  high: number;
  hueFraction: number;
}) {
  const position = ((hueFraction % 1) + 1) % 1;
  const isRampingUp = position < 1 / HUE_SEGMENTS;
  const isAtHigh = position < 1 / 2;
  const isRampingDown = position < HUE_RAMP_DOWN_END;
  if (isRampingUp) {
    return low + (high - low) * HUE_SEGMENTS * position;
  }

  if (isAtHigh) {
    return high;
  }

  return isRampingDown ? low + (high - low) * (HUE_RAMP_DOWN_END - position) * HUE_SEGMENTS : low;
}

function parseHslColor(token: string) {
  const match = /^hsla?\((.*)\)$/iu.exec(token);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const [channels = "", alphaText] = splitSlash(match[1] ?? "");
  const parts = channels.includes(",") ? splitCommas(channels) : splitWords(channels);
  const [huePart = "", saturationPart = "", lightnessPart = "", legacyAlpha] = parts;
  const hue = parseNumber(huePart.replace(/deg$/iu, ""));
  const saturation = parsePercent(saturationPart);
  const lightness = parsePercent(lightnessPart);
  const alpha = alphaValue(alphaText ?? legacyAlpha);
  const isValid = hue !== null && saturation !== null && lightness !== null && alpha !== null;
  if (!isValid) {
    return null;
  }

  const isDark = lightness < MIDDLE_LIGHTNESS;
  const high = isDark ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const low = 2 * lightness - high;
  const hueFraction = (((hue % DEGREES_PER_TURN) + DEGREES_PER_TURN) % DEGREES_PER_TURN) / DEGREES_PER_TURN;
  const channelOffsets = [1 / CHANNELS_PER_COLOR, 0, -1 / CHANNELS_PER_COLOR];
  const [red, green, blue] = channelOffsets.map(offset => hueChannel({
    low,
    high,
    hueFraction: hueFraction + offset
  }) * MAX_CHANNEL);
  return xamlColor({
    red: red ?? 0,
    green: green ?? 0,
    blue: blue ?? 0,
    alpha
  });
}

/**
 * A color as XAML spells it, or null: hex (3, 4, 6 or 8 digits), rgb()/rgba(),
 * hsl()/hsla(), a CSS name or `transparent`. `currentcolor` has no meaning in
 * WinUI, where a Foreground is inherited by the control, not by a style.
 */
export function parseColor(token: string) {
  const lower = token.toLowerCase();
  const isTransparent = lower === "transparent";
  if (isTransparent) {
    return TRANSPARENT_COLOR;
  }

  const named = namedColors.get(lower);
  const hasNamed = named !== undefined;
  if (hasNamed) {
    return `#${named.toUpperCase()}`;
  }

  return parseHexColor(token) ?? parseRgbColor(token) ?? parseHslColor(token);
}
