import { colorChannelsOf, hexOfChannels } from "./css-color.ts";
import { closingIndex, splitTopLevel } from "./css-split.ts";

export const GradientKind = {
  LINEAR: "linear",
  RADIAL: "radial"
} as const;
export type GradientKind = (typeof GradientKind)[keyof typeof GradientKind];

export interface GradientStop {
  color: string;
  position: number;
}

export interface GradientPreview {
  kind: GradientKind;
  start: number;
  end: number;
  stops: GradientStop[];
}

interface RawStop {
  color: string;
  position: number | undefined;
}

const FUNCTION = /(?:repeating-)?(linear|radial)-gradient\(/giu;
const BRUSH = /<(Linear|Radial)GradientBrush\b[^>]*>(?<body>[\s\S]*?)<\/\1GradientBrush>/gu;
const GRADIENT_STOP = /<GradientStop\b(?<attributes>[^>]*?)\/?>/gu;
const COLOR_ATTRIBUTE = /\bcolor=["'{]+\s*["']?(?<value>[^"'}]+)/iu;
const OFFSET_ATTRIBUTE = /\boffset=["'{]+\s*["']?(?<value>[^"'}]+)/iu;
const PERCENT = /^(-?\d*\.?\d+)%$/u;
const PERCENT_DIVISOR = 100;
const POSITION_DIGITS = 4;
const MIN_STOPS = 2;

function positionOf(word: string) {
  const percent = PERCENT.exec(word)?.[1];
  const hasPercent = percent !== undefined;
  if (hasPercent) {
    return Number(percent) / PERCENT_DIVISOR;
  }

  return word === "0" ? 0 : undefined;
}

function anchorOf({ i, last }: {
  i: number;
  last: number;
}) {
  const isFirst = i === 0;
  if (isFirst) {
    return 0;
  }

  const isLast = i === last;
  return isLast ? 1 : undefined;
}

function resolved(stops: RawStop[]) {
  const last = stops.length - 1;
  const anchored = stops.map((stop, i) => stop.position ?? anchorOf({
    i,
    last
  }));
  let ceiling = 0;
  const positions: number[] = [];
  for (const [i, position] of anchored.entries()) {
    const hasNoPosition = position === undefined;
    if (hasNoPosition) {
      const next = anchored.findIndex((candidate, iNext) => iNext > i && candidate !== undefined);
      const gap = next - (positions.length - 1);
      const target = Math.max(anchored[next] ?? 1, ceiling);
      ceiling += (target - ceiling) / gap;
      positions.push(ceiling);
      continue;
    }

    ceiling = Math.max(ceiling, position);
    positions.push(ceiling);
  }

  return stops.map((stop, i) => ({
    color: stop.color,
    position: Number((positions[i] ?? 0).toFixed(POSITION_DIGITS))
  }));
}

function colorStops(items: string[]) {
  return items.flatMap(argument => {
    const [first = "", ...positions] = splitTopLevel({
      text: argument,
      separator: " "
    });
    const channels = colorChannelsOf(first);
    const hasNoChannels = channels === undefined;
    if (hasNoChannels) {
      return [];
    }

    const color = hexOfChannels(channels);
    const places = positions.map(positionOf);
    return places.length > 1 ? places.map(position => ({
      color,
      position
    })) : [{
      color,
      position: places[0]
    }];
  });
}

function previewOf({ kind, stops, start, end }: {
  kind: GradientKind;
  stops: RawStop[];
  start: number;
  end: number;
}) {
  const hasStops = stops.length >= MIN_STOPS;
  return hasStops ? [{
    kind,
    start,
    end,
    stops: resolved(stops)
  } satisfies GradientPreview] : [];
}

/**
 * The gradients written as `linear-gradient()` or `radial-gradient()` in a CSS value, with the range each takes
 * in the value. A stop whose position is not a percentage is spaced evenly, as one with none is; the library's
 * parser (src/css/parse/gradients.ts) is the reference for what a gradient means.
 */
export function gradientsOf(value: string) {
  return [...value.matchAll(FUNCTION)].flatMap(match => {
    const open = match.index + match[0].length - 1;
    const end = closingIndex({
      text: value,
      open
    });
    const isUnclosed = end === -1;
    if (isUnclosed) {
      return [];
    }

    const items = splitTopLevel({
      text: value.slice(open + 1, end - 1),
      separator: ","
    });
    const hasDirection = colorChannelsOf(
      splitTopLevel({
        text: items[0] ?? "",
        separator: " "
      })[0] ?? ""
    ) === undefined;
    return previewOf({
      kind: match[1]?.toLowerCase() === GradientKind.RADIAL ? GradientKind.RADIAL : GradientKind.LINEAR,
      stops: colorStops(hasDirection ? items.slice(1) : items),
      start: match.index,
      end
    });
  });
}

function xamlStops(body: string) {
  return [...body.matchAll(GRADIENT_STOP)].flatMap(stop => {
    const attributes = stop.groups?.["attributes"] ?? "";
    const channels = colorChannelsOf(COLOR_ATTRIBUTE.exec(attributes)?.groups?.["value"] ?? "");
    const offset = Number(OFFSET_ATTRIBUTE.exec(attributes)?.groups?.["value"]);
    return channels === undefined ? [] : [{
      color: hexOfChannels(channels),
      position: Number.isNaN(offset) ? undefined : offset
    }];
  });
}

/**
 * The gradients written as a `LinearGradientBrush` or `RadialGradientBrush` of `GradientStop`s in markup, with the
 * range each takes in the text.
 */
export function brushGradientsOf(text: string) {
  return [...text.matchAll(BRUSH)].flatMap(match => previewOf({
    kind: match[1] === "Radial" ? GradientKind.RADIAL : GradientKind.LINEAR,
    stops: xamlStops(match.groups?.["body"] ?? ""),
    start: match.index,
    end: match.index + match[0].length
  }));
}
