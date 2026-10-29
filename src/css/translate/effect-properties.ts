import type { GroupInput, PropertyGroup, WriteContext } from "./property-kit.ts";
import {
  parseLength,
  parseNumber,
  parsePercent,
  splitSlash,
  splitWords
} from "#src/css/parse/values.js";

const CLIP_PATH = "clip-path";
const ASPECT_RATIO = "aspect-ratio";
const CLIP_TARGET = "clip";
const ASPECT_TARGET = "aspect";
const INSET = /^inset\((.*)\)$/isu;
const SIDE_SEPARATOR = ",";
const PERCENT_SCALE = 100;
const MAX_INSET_VALUES = 4;
const MIN_ASPECT_CHANGE = 0.5;
const SHAPES = /^(circle|ellipse|polygon|path|rect|xywh|url)\(/iu;
const NO_INSET = "0px";

// One inset as `Npx` or `N%`, or null.
function insetSide(word: string) {
  const fraction = parsePercent(word);
  const isPercent = fraction !== null;
  if (isPercent) {
    return `${fraction * PERCENT_SCALE}%`;
  }

  const pixels = parseLength(word);
  return pixels === null ? null : `${pixels}px`;
}

/**
 * `clip-path: inset(top right bottom left)`: UIElement.Clip, a RectangleGeometry
 * as large as the element less the insets (px or %), kept in step with its size.
 * The other shapes are errors: a Clip takes a rectangle and nothing else.
 */
function clipPath(input: GroupInput) {
  const reader = input.reading(CLIP_PATH);
  const text = reader.declaration.value.trim();
  const isNone = text.toLowerCase() === "none";
  if (isNone) {
    return [];
  }

  const insetArguments = INSET.exec(text)?.[1];
  const isInset = insetArguments !== undefined;
  if (!isInset) {
    const why = SHAPES.test(text) ? "UIElement.Clip is a RectangleGeometry: only inset() has a WinUI meaning" : "expected none or inset()";
    reader.error(`${CLIP_PATH}: ${text} has no WinUI meaning (${why})`);
    return [];
  }

  const words = splitWords(insetArguments);
  const sides = words.map(insetSide);
  const isRound = words.some(word => word.toLowerCase() === "round");
  const isValid = !isRound && words.length >= 1 && words.length <= MAX_INSET_VALUES && !sides.includes(null);
  if (!isValid) {
    reader.error(`${CLIP_PATH}: inset() takes one to four lengths or percentages, with no round (a RectangleGeometry has square corners)`);
    return [];
  }

  const [top = NO_INSET, right = top, bottom = top, left = right] = sides;
  return [{
    kind: "write",
    target: CLIP_TARGET,
    value: [top, right, bottom, left].join(SIDE_SEPARATOR)
  } as const];
}

function amountOf({ text, size }: {
  text: string;
  size: number;
}) {
  const amount = Number.parseFloat(text);
  return text.endsWith("%") ? amount / PERCENT_SCALE * size : amount;
}

function clipTo({ native, control, value }: WriteContext) {
  function size(property: string) {
    return Number(
      native.read({
        control,
        property
      }) ?? 0
    );
  }

  function place() {
    const [top = NO_INSET, right = NO_INSET, bottom = NO_INSET, left = NO_INSET] = value.split(SIDE_SEPARATOR);
    const [width, height] = [size("actualWidth"), size("actualHeight")];
    const insets = {
      top: amountOf({
        text: top,
        size: height
      }),
      right: amountOf({
        text: right,
        size: width
      }),
      bottom: amountOf({
        text: bottom,
        size: height
      }),
      left: amountOf({
        text: left,
        size: width
      })
    };
    native.clip({
      control,
      rect: {
        x: insets.left,
        y: insets.top,
        width: Math.max(0, width - insets.left - insets.right),
        height: Math.max(0, height - insets.top - insets.bottom)
      }
    });
  }

  place();
  const unsubscribe = native.subscribe(control, "SizeChanged", place);
  return () => {
    unsubscribe?.();
    native.clip({
      control,
      rect: null
    });
  };
}

/**
 * `aspect-ratio`: `auto`, a number or `w / h`. WinUI has none, so the element's
 * Height follows its Width (as laid out) on every size change. An element that
 * also has a `height` gets the ratio's, which a warning says.
 */
function aspectRatio(input: GroupInput) {
  const reader = input.reading(ASPECT_RATIO);
  const text = reader.declaration.value.trim();
  const isAuto = text.toLowerCase() === "auto";
  if (isAuto) {
    return [];
  }

  const [width = "", height = "1"] = splitSlash(text).map(part => part.trim());
  const [wide, tall] = [parseNumber(width), parseNumber(height)];
  const isRatio = wide !== null && tall !== null && wide > 0 && tall > 0;
  if (!isRatio) {
    reader.expected("auto, a positive number or two separated by a slash");
    return [];
  }

  if (input.computed.has("height")) {
    reader.warn(`${ASPECT_RATIO}: with a height set, the ratio wins (CSS would use the height)`);
  }

  return [{
    kind: "write",
    target: ASPECT_TARGET,
    value: String(wide / tall)
  } as const];
}

function followRatio({ native, control, value }: WriteContext) {
  const ratio = Number(value);
  function place() {
    const width = Number(
      native.read({
        control,
        property: "actualWidth"
      }) ?? 0
    );
    const current = Number(
      native.read({
        control,
        property: "actualHeight"
      }) ?? 0
    );
    const target = width / ratio;
    const isChanged = width > 0 && Math.abs(current - target) > MIN_ASPECT_CHANGE;
    if (isChanged) {
      native.assign(control, { height: target });
    }
  }

  place();
  return native.subscribe(control, "SizeChanged", place);
}

/**
 * The property groups of `clip-path` and `aspect-ratio`. Apart from the
 * built-in groups, as the gradients are: a sheet that uses one registers them.
 */
export function effectGroups() {
  return [
    {
      members: [CLIP_PATH],
      lower: clipPath,
      writes: {
        [CLIP_TARGET]: clipTo
      }
    },
    {
      members: [ASPECT_RATIO],
      lower: aspectRatio,
      writes: {
        [ASPECT_TARGET]: followRatio
      }
    }
  ] satisfies PropertyGroup[];
}

/** The members the effect groups are lowered from. */
export const EFFECT_MEMBERS = [CLIP_PATH, ASPECT_RATIO];
