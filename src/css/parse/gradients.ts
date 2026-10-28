import { parseColor } from "./colors.ts";
import {
  parseLength,
  parseNumber,
  parsePercent,
  splitCommas,
  splitWords
} from "./values.ts";

/** A place in an element's bounding box, as fractions of its width and height. */
export interface GradientPoint {
  readonly x: number;
  readonly y: number;
}

/** One stop of a gradient: a XAML color and where it sits along the gradient, from 0 to 1. */
export interface GradientStop {
  readonly color: string;
  readonly offset: number;
}

/**
 * A gradient in the terms of WinUI's brushes: every point and radius is a
 * fraction of the element's bounding box (the brushes' default mapping), and
 * `warnings` are the ways the result differs from what CSS draws.
 */
export type Gradient =
  | {
    readonly kind: "linear";
    readonly start: GradientPoint;
    readonly end: GradientPoint;
    readonly stops: readonly GradientStop[];
    readonly warnings: readonly string[];
  }
  | {
    readonly kind: "radial";
    readonly center: GradientPoint;
    readonly radiusX: number;
    readonly radiusY: number;
    readonly stops: readonly GradientStop[];
    readonly warnings: readonly string[];
  };

interface Failure {
  readonly isValid: false;
  readonly reason: string;
}

const GRADIENT_FUNCTION = /^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/isu;
const ANGLE = /^(-?(?:\d+\.?\d*|\.\d+))(deg|grad|rad|turn)$/iu;
const GRADIANS_PER_TURN = 400;
const DEGREES_PER_TURN = 360;
const FRACTION_DIGITS = 4;
const CARDINAL_TOLERANCE = 1e-9;
const MIDDLE = 0.5;
const MIN_STOPS = 2;
const MAX_STOP_POSITIONS = 2;
const TRANSPARENT_ALPHA_PREFIX = "#00";
const ARGB_LENGTH = 9;
const RGB_DIGITS = 6;

const TURNS_PER_UNIT = new Map([
  ["deg", 1 / DEGREES_PER_TURN],
  ["grad", 1 / GRADIANS_PER_TURN],
  ["rad", 1 / (2 * Math.PI)],
  ["turn", 1]
]);

const HORIZONTAL_SIDES = new Map([
  ["left", 0],
  ["center", MIDDLE],
  ["right", 1]
]);
const VERTICAL_SIDES = new Map([
  ["top", 0],
  ["center", MIDDLE],
  ["bottom", 1]
]);
const HORIZONTAL_ONLY = new Set(["left", "right"]);
const VERTICAL_ONLY = new Set(["top", "bottom"]);
const SIZE_KEYWORDS = new Set(["closest-side", "closest-corner", "farthest-side", "farthest-corner"]);
const SHAPE_KEYWORDS = new Set(["circle", "ellipse"]);

function fail(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

// Rounded so that sin(180deg) is 0, not 1.2e-16; `+ 0` turns -0 into 0.
function clean(value: number) {
  return Number(value.toFixed(FRACTION_DIGITS)) + 0;
}

function point({ x, y }: GradientPoint) {
  return {
    x: clean(x),
    y: clean(y)
  };
}

function isFailure(value: object): value is Failure {
  return "isValid" in value && value.isValid === false;
}

// `0deg`-style angle in radians, or null when the word is not an angle. A bare
// 0 is an angle in CSS.
function parseAngle(word: string) {
  const isZero = parseNumber(word) === 0;
  if (isZero) {
    return 0;
  }

  const match = ANGLE.exec(word);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return null;
  }

  const turns = (TURNS_PER_UNIT.get((match[2] ?? "").toLowerCase()) ?? 0) * Number(match[1]);
  return turns * 2 * Math.PI;
}

// `to right`, `to bottom left`: the keyword corner or side, exactly. The
// stretched unit square puts the 50% line through the two other corners, as
// CSS does for a corner.
function sideDirection(words: string[]) {
  const sides = words.slice(1).map(word => word.toLowerCase());
  const horizontal = sides.filter(side => side === "left" || side === "right");
  const vertical = sides.filter(side => side === "top" || side === "bottom");
  const isCountValid = sides.length >= 1 && sides.length <= MAX_STOP_POSITIONS;
  const isEachSideKnown = horizontal.length + vertical.length === sides.length;
  const isOnePerAxis = horizontal.length <= 1 && vertical.length <= 1;
  const isValid = isCountValid && isEachSideKnown && isOnePerAxis;
  if (!isValid) {
    return fail(`expected a direction such as "to right" or "to bottom left", found "${words.join(" ")}"`);
  }

  const isToRight = horizontal[0] === "right";
  const isToBottom = vertical[0] === "bottom";
  const hasHorizontal = horizontal.length === 1;
  const hasVertical = vertical.length === 1;
  const end = {
    x: hasHorizontal ? Number(isToRight) : MIDDLE,
    y: hasVertical ? Number(isToBottom) : MIDDLE
  };
  const start = {
    x: hasHorizontal ? Number(!isToRight) : MIDDLE,
    y: hasVertical ? Number(!isToBottom) : MIDDLE
  };
  return {
    isValid: true,
    start,
    end,
    warnings: []
  } as const;
}

// The gradient line of an angle through the middle of a square box, which is
// where CSS puts its 0% and 100%. The brush maps to the bounding box, so on
// any other box the angle stretches with it: said so in a warning.
function angleDirection({ text, radians }: {
  text: string;
  radians: number;
}) {
  const across = Math.sin(radians);
  const down = -Math.cos(radians);
  const half = (Math.abs(across) + Math.abs(down)) / 2;
  const isCardinal = Math.abs(across * down) < CARDINAL_TOLERANCE;
  return {
    isValid: true,
    start: point({
      x: MIDDLE - across * half,
      y: MIDDLE - down * half
    }),
    end: point({
      x: MIDDLE + across * half,
      y: MIDDLE + down * half
    }),
    warnings: isCardinal ? [] : [`${text} is exact on a square element only (WinUI maps a gradient to the element's size, so it skews on any other); "to bottom right" is exact on every size`]
  } as const;
}

// The first argument of linear-gradient(): null when it is a color stop, not a direction.
function linearDirection(text: string) {
  const words = splitWords(text);
  const [first = ""] = words;
  const isSide = first.toLowerCase() === "to";
  if (isSide) {
    return sideDirection(words);
  }

  const radians = words.length === 1 ? parseAngle(first) : null;
  const isAngle = radians !== null;
  if (isAngle) {
    return angleDirection({
      text: first,
      radians
    });
  }

  return null;
}

function withoutOpacity(color: string) {
  return `${TRANSPARENT_ALPHA_PREFIX}${color.slice(-RGB_DIGITS)}`;
}

function isFullyTransparent(color: string) {
  return color.length === ARGB_LENGTH && color.startsWith(TRANSPARENT_ALPHA_PREFIX);
}

interface RawStop {
  color: string;
  position: number | null;
}

function stopPositions(words: string[]) {
  const positions: number[] = [];
  for (const word of words) {
    const isZero = parseLength(word) === 0;
    const position = isZero ? 0 : parsePercent(word);
    const isPosition = position !== null;
    if (!isPosition) {
      return fail(`"${word}" is not a stop position (WinUI maps a gradient to the element's size, so a position is a percentage, not a length)`);
    }

    const isInRange = position >= 0 && position <= 1;
    if (!isInRange) {
      return fail(`"${word}" is outside the gradient (a WinUI stop sits between 0% and 100%)`);
    }

    positions.push(position);
  }

  return positions;
}

// `red`, `red 20%` or `red 20% 40%` (a stop that holds its color between two places).
function parseColorStop(text: string) {
  const [colorWord = "", ...positionWords] = splitWords(text);
  const color = parseColor(colorWord);
  const isVariable = colorWord.toLowerCase().startsWith("var(");
  if (isVariable) {
    return fail(`${colorWord} cannot be a gradient stop (a Style holds one resource reference per declaration; write the color)`);
  }

  const isColorMissing = color === null;
  if (isColorMissing) {
    const isHint = parsePercent(colorWord) !== null || parseLength(colorWord) !== null;
    const reason = isHint
      ? `a color hint ("${text}") has no WinUI meaning (a gradient interpolates linearly between its stops)`
      : `expected a color stop (a color and up to two percentages), found "${text}"`;
    return fail(reason);
  }

  const hasTooManyPositions = positionWords.length > MAX_STOP_POSITIONS;
  if (hasTooManyPositions) {
    return fail(`expected a color stop (a color and up to two percentages), found "${text}"`);
  }

  const positions = stopPositions(positionWords);
  if (isFailure(positions)) {
    return positions;
  }

  const stops: RawStop[] = positions.length === 0 ? [{
    color,
    position: null
  }] : positions.map(position => ({
    color,
    position
  }));
  return {
    isValid: true,
    stops
  } as const;
}

// CSS's color stop fix-up: the ends default to 0% and 100%, a stop never sits
// before the one ahead of it, and stops without a place share the gap evenly.
function placeStops(raw: RawStop[]) {
  const positions = raw.map(stop => stop.position);
  const lastIndex = positions.length - 1;
  positions[0] ??= 0;
  positions[lastIndex] ??= 1;
  let highest = 0;
  for (const [index, position] of positions.entries()) {
    const isPlaced = position !== null;
    if (isPlaced) {
      highest = Math.max(highest, position);
      positions[index] = highest;
    }
  }

  let previousPlaced = 0;
  for (let index = 1; index <= lastIndex; index++) {
    const isPlaced = positions[index] !== null;
    if (isPlaced) {
      const from = positions[previousPlaced] ?? 0;
      const to = positions[index] ?? 0;
      const gaps = index - previousPlaced;
      for (let between = previousPlaced + 1; between < index; between++) {
        positions[between] = from + ((to - from) * (between - previousPlaced)) / gaps;
      }

      previousPlaced = index;
    }
  }

  return raw.map((stop, index) => ({
    color: stop.color,
    offset: clean(positions[index] ?? 0)
  }));
}

function nearestVisible({ stops, from, step }: {
  stops: GradientStop[];
  from: number;
  step: 1 | -1;
}) {
  for (let index = from + step; index >= 0 && index < stops.length; index += step) {
    const color = stops[index]?.color;
    const isVisible = color !== undefined && !isFullyTransparent(color);
    if (isVisible) {
      return color;
    }
  }

  return null;
}

// CSS fades toward `transparent` with the color of its neighbors (it
// interpolates premultiplied), where a plain #00FFFFFF would tint the fade
// white. A transparent stop becomes each neighbor's color at no opacity.
function fadeTransparent(stops: GradientStop[]) {
  return stops.flatMap((stop, index) => {
    if (!isFullyTransparent(stop.color)) {
      return [stop];
    }

    const neighbors = [
      nearestVisible({
        stops,
        from: index,
        step: -1
      }),
      nearestVisible({
        stops,
        from: index,
        step: 1
      })
    ].filter(color => color !== null).map(withoutOpacity);
    const faded = [...new Set(neighbors)];
    return faded.length === 0 ? [stop] : faded.map(color => ({
      color,
      offset: stop.offset
    }));
  });
}

function parseStops(args: string[]) {
  const isTooShort = args.length < MIN_STOPS;
  if (isTooShort) {
    return fail("a gradient needs at least two color stops");
  }

  const raw: RawStop[] = [];
  for (const arg of args) {
    const parsed = parseColorStop(arg);
    if (isFailure(parsed)) {
      return parsed;
    }

    raw.push(...parsed.stops);
  }

  return {
    isValid: true,
    stops: fadeTransparent(placeStops(raw))
  } as const;
}

function parseLinear(args: string[]) {
  const [first = "", ...rest] = args;
  const direction = linearDirection(first);
  const isDirectionMissing = direction === null;
  if (isDirectionMissing) {
    const stops = parseStops(args);
    return isFailure(stops) ? stops : {
      isValid: true,
      gradient: {
        kind: "linear",
        start: {
          x: MIDDLE,
          y: 0
        },
        end: {
          x: MIDDLE,
          y: 1
        },
        stops: stops.stops,
        warnings: []
      }
    } as const;
  }

  if (isFailure(direction)) {
    return direction;
  }

  const stops = parseStops(rest);
  return isFailure(stops) ? stops : {
    isValid: true,
    gradient: {
      kind: "linear",
      start: direction.start,
      end: direction.end,
      stops: stops.stops,
      warnings: direction.warnings
    }
  } as const;
}

function axisWords(words: string[]) {
  const [first = "center", second = "center"] = words;
  const isSingleVertical = words.length === 1 && VERTICAL_ONLY.has(first);
  if (isSingleVertical) {
    return ["center", first];
  }

  const isSwapped = VERTICAL_ONLY.has(first) || HORIZONTAL_ONLY.has(second);
  return isSwapped ? [second, first] : [first, second];
}

// `at left`, `at 30% 70%`, `at top right`: a keyword or percentage per axis.
function parsePosition(words: string[]) {
  const [across = "", down = ""] = axisWords(words.map(word => word.toLowerCase()));
  const x = HORIZONTAL_SIDES.get(across) ?? parsePercent(across);
  const y = VERTICAL_SIDES.get(down) ?? parsePercent(down);
  const hasEveryAxis = x !== null && y !== null && words.length <= MAX_STOP_POSITIONS;
  if (!hasEveryAxis) {
    return fail(`expected a position of keywords (left, right, top, bottom, center) or percentages after "at", found "${words.join(" ")}"`);
  }

  return {
    isValid: true,
    point: {
      x,
      y
    }
  } as const;
}

interface RadialConfig {
  isCircle: boolean;
  size: string;
  radii: number[];
  words: string[];
}

// Which parts of the configuration a word has already given.
interface Seen {
  hasShape: boolean;
  hasSize: boolean;
}

// Takes one word of the configuration into `config`; the problem with it, or null.
function takeWord({ config, seen, word }: {
  config: RadialConfig;
  seen: Seen;
  word: string;
}) {
  const lower = word.toLowerCase();
  const percent = parsePercent(word);
  const isShape = SHAPE_KEYWORDS.has(lower) && !seen.hasShape;
  const isSize = SIZE_KEYWORDS.has(lower) && !seen.hasSize;
  const isLength = parseLength(word) !== null;
  const isRadius = percent !== null;
  if (isShape) {
    config.isCircle = lower === "circle";
    seen.hasShape = true;
    return null;
  }

  if (isSize) {
    config.size = lower;
    seen.hasSize = true;
    return null;
  }

  if (isRadius) {
    config.radii.push(percent);
    return null;
  }

  if (isLength) {
    return `"${word}" is not a radius WinUI can use (it maps a gradient to the element's size: use a percentage or a keyword such as closest-side)`;
  }

  return `expected a shape, a size or "at <position>", found "${word}"`;
}

function readRadialConfig(words: string[]) {
  const config: RadialConfig = {
    isCircle: false,
    size: "farthest-corner",
    radii: [],
    words: []
  };
  const seen: Seen = {
    hasShape: false,
    hasSize: false
  };
  for (const [index, word] of words.entries()) {
    const isPosition = word.toLowerCase() === "at";
    if (isPosition) {
      config.words = words.slice(index + 1);
      return config.words.length === 0 ? fail("expected a position after \"at\"") : config;
    }

    const problem = takeWord({
      config,
      seen,
      word
    });
    const hasProblem = problem !== null;
    if (hasProblem) {
      return fail(problem);
    }
  }

  const isSizedTwice = seen.hasSize && config.radii.length > 0;
  return isSizedTwice ? fail("expected a size keyword or percentages for the radii, not both") : config;
}

interface Radii {
  x: number;
  y: number;
}

function radiiOf({ config, center }: {
  config: RadialConfig;
  center: GradientPoint;
}) {
  const closest = {
    x: Math.min(center.x, 1 - center.x),
    y: Math.min(center.y, 1 - center.y)
  };
  const farthest = {
    x: Math.max(center.x, 1 - center.x),
    y: Math.max(center.y, 1 - center.y)
  };
  const ellipseRadii = new Map<string, Radii>([
    ["closest-side", closest],
    ["farthest-side", farthest],
    ["closest-corner", {
      x: closest.x * Math.SQRT2,
      y: closest.y * Math.SQRT2
    }],
    ["farthest-corner", {
      x: farthest.x * Math.SQRT2,
      y: farthest.y * Math.SQRT2
    }]
  ]);
  const circleRadii = new Map<string, number>([
    ["closest-side", Math.min(closest.x, closest.y)],
    ["farthest-side", Math.max(farthest.x, farthest.y)],
    ["closest-corner", Math.hypot(closest.x, closest.y)],
    ["farthest-corner", Math.hypot(farthest.x, farthest.y)]
  ]);
  const circle = circleRadii.get(config.size) ?? 0;
  return config.isCircle ? {
    x: circle,
    y: circle
  } : ellipseRadii.get(config.size) ?? closest;
}

function explicitRadii(config: RadialConfig) {
  const [across, down] = config.radii;
  const hasTwoRadii = config.radii.length === MAX_STOP_POSITIONS && across !== undefined && down !== undefined;
  const hasBothRadii = hasTwoRadii && !config.isCircle;
  return hasBothRadii ? {
    x: across,
    y: down
  } : null;
}

function parseRadial(args: string[]) {
  const [first = "", ...rest] = args;
  const [firstWord = ""] = splitWords(first);
  const lowerWord = firstWord.toLowerCase();
  const isConfig = SHAPE_KEYWORDS.has(lowerWord) || SIZE_KEYWORDS.has(lowerWord) || lowerWord === "at" || parsePercent(firstWord) !== null || parseLength(firstWord) !== null;
  const config = isConfig ? readRadialConfig(splitWords(first)) : readRadialConfig([]);
  if (isFailure(config)) {
    return config;
  }

  const placement = config.words.length === 0 ? {
    isValid: true,
    point: {
      x: MIDDLE,
      y: MIDDLE
    }
  } as const : parsePosition(config.words);
  if (isFailure(placement)) {
    return placement;
  }

  const hasRadiiOfWrongCount = config.radii.length !== 0 && explicitRadii(config) === null;
  if (hasRadiiOfWrongCount) {
    return fail("expected two percentages for the radii of an ellipse (a circle's radius is a length, which WinUI cannot use)");
  }

  const stops = parseStops(isConfig ? rest : args);
  if (isFailure(stops)) {
    return stops;
  }

  const center = point(placement.point);
  const radii = explicitRadii(config) ?? radiiOf({
    config,
    center
  });
  const hasNoArea = radii.x <= 0 || radii.y <= 0;
  if (hasNoArea) {
    return fail("the gradient's size is zero here (a radial gradient on the edge of the element with closest-side or closest-corner)");
  }

  return {
    isValid: true,
    gradient: {
      kind: "radial",
      center,
      radiusX: clean(radii.x),
      radiusY: clean(radii.y),
      stops: stops.stops,
      warnings: config.isCircle ? ["circle is a circle on a square element only (WinUI maps a gradient to the element's size, so it is an ellipse on any other)"] : []
    }
  } as const;
}

/**
 * Reads `linear-gradient()` or `radial-gradient()` into a WinUI brush's
 * terms. Directions, angles, positions and stops come out as fractions of
 * the bounding box, which is how a WinUI gradient brush maps by default; what
 * that cannot keep exactly is in `warnings`, and what it cannot express at all
 * (a length, a repeating or conic gradient, `var()`) is the `reason`.
 */
export function parseGradient(text: string) {
  const match = GRADIENT_FUNCTION.exec(text.trim());
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return fail(`expected linear-gradient() or radial-gradient(), found "${text}" (an image cannot be a Background in a Style; use an Image element)`);
  }

  const [, repeating, kind = "", inner = ""] = match;
  const isRepeating = repeating !== undefined;
  if (isRepeating) {
    return fail(`repeating-${kind}-gradient has no WinUI meaning (write out the stops)`);
  }

  const isConic = kind.toLowerCase() === "conic";
  if (isConic) {
    return fail("conic-gradient has no WinUI meaning (WinUI has linear and radial gradient brushes)");
  }

  const args = splitCommas(inner);
  return kind.toLowerCase() === "linear" ? parseLinear(args) : parseRadial(args);
}
