import type { PropertyGroup } from "./property-kit.ts";
import { defaultOriginProperty, transformOriginProperty } from "./transform-origin-properties.ts";
import { DEFAULT_ORIGIN, ORIGIN_TARGET } from "./transform-origin.ts";
import { parseDegrees } from "#src/css/parse/angles.js";
import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parseNumber, splitCommas, splitWords } from "#src/css/parse/values.js";

const MEMBER = "transform";
const FUNCTION = /^([a-z][a-z0-9]*)\((.*)\)$/isu;
const MATRIX_VALUES = 6;

/** One function CSS allows in a `transform` list, and the WinUI transform it becomes. */
interface FunctionSpec {
  /** How many arguments it takes. */
  min: number;
  max: number;
  /** Reads one argument; null when it is not the kind this function takes. */
  parse(token: string): number | null;
  /** The kind of argument, for the message about one it cannot read. */
  what: string;
  xaml(values: number[]): string;
}

const LENGTH = {
  parse: parseLength,
  what: "a length in px"
};
const NUMBER = {
  parse: parseNumber,
  what: "a number"
};
const ANGLE = {
  parse: parseDegrees,
  what: "an angle (deg, rad, turn or grad)"
};

// Lengths and numbers default as CSS does: a missing second translation is 0,
// a missing second scale is the first.
const FUNCTIONS = new Map<string, FunctionSpec>([
  ["translate", {
    ...LENGTH,
    min: 1,
    max: 2,
    xaml: ([x = 0, y = 0]) => `<TranslateTransform X="${x}" Y="${y}"/>`
  }],
  ["translatex", {
    ...LENGTH,
    min: 1,
    max: 1,
    xaml: ([x = 0]) => `<TranslateTransform X="${x}"/>`
  }],
  ["translatey", {
    ...LENGTH,
    min: 1,
    max: 1,
    xaml: ([y = 0]) => `<TranslateTransform Y="${y}"/>`
  }],
  ["scale", {
    ...NUMBER,
    min: 1,
    max: 2,
    xaml: ([x = 1, y = x]) => `<ScaleTransform ScaleX="${x}" ScaleY="${y}"/>`
  }],
  ["scalex", {
    ...NUMBER,
    min: 1,
    max: 1,
    xaml: ([x = 1]) => `<ScaleTransform ScaleX="${x}"/>`
  }],
  ["scaley", {
    ...NUMBER,
    min: 1,
    max: 1,
    xaml: ([y = 1]) => `<ScaleTransform ScaleY="${y}"/>`
  }],
  ["rotate", {
    ...ANGLE,
    min: 1,
    max: 1,
    xaml: ([angle = 0]) => `<RotateTransform Angle="${angle}"/>`
  }],
  ["rotatez", {
    ...ANGLE,
    min: 1,
    max: 1,
    xaml: ([angle = 0]) => `<RotateTransform Angle="${angle}"/>`
  }],
  ["skew", {
    ...ANGLE,
    min: 1,
    max: 2,
    xaml: ([x = 0, y = 0]) => `<SkewTransform AngleX="${x}" AngleY="${y}"/>`
  }],
  ["skewx", {
    ...ANGLE,
    min: 1,
    max: 1,
    xaml: ([x = 0]) => `<SkewTransform AngleX="${x}"/>`
  }],
  ["skewy", {
    ...ANGLE,
    min: 1,
    max: 1,
    xaml: ([y = 0]) => `<SkewTransform AngleY="${y}"/>`
  }],
  // CSS's matrix(a, b, c, d, e, f) is WinUI's Matrix, in the same order.
  ["matrix", {
    ...NUMBER,
    min: MATRIX_VALUES,
    max: MATRIX_VALUES,
    xaml: values => `<MatrixTransform Matrix="${values.join(",")}"/>`
  }]
]);

const THREE_DIMENSIONAL = new Set([
  "translatez",
  "translate3d",
  "scalez",
  "scale3d",
  "rotatex",
  "rotatey",
  "rotate3d",
  "perspective",
  "matrix3d"
]);

function parseArguments({ spec, name, args, reader }: {
  spec: FunctionSpec;
  name: string;
  args: string[];
  reader: Reader;
}) {
  const isCountValid = args.length >= spec.min && args.length <= spec.max;
  if (!isCountValid) {
    return reader.error(`transform: ${name}() takes ${spec.min === spec.max ? spec.min : `${spec.min} or ${spec.max}`} argument(s), found ${args.length}`);
  }

  const values = args.map(spec.parse);
  const badIndex = values.indexOf(null);
  const isBadFound = badIndex !== -1;
  if (isBadFound) {
    return reader.error(`transform: ${name}() expected ${spec.what}, found "${args[badIndex]}"`);
  }

  return spec.xaml(values.filter(value => value !== null));
}

function parseFunction({ word, reader }: {
  word: string;
  reader: Reader;
}) {
  const match = FUNCTION.exec(word);
  const name = (match?.[1] ?? "").toLowerCase();
  const spec = FUNCTIONS.get(name);
  const isSpecMissing = spec === undefined || match === null;
  if (isSpecMissing) {
    const why = THREE_DIMENSIONAL.has(name) ? "a RenderTransform is two-dimensional" : "WinUI has no such transform";
    return reader.error(`transform: ${word} has no WinUI meaning (${why}; use translate(), scale(), rotate(), skew() or matrix())`);
  }

  return parseArguments({
    spec,
    name,
    args: splitCommas(match[2] ?? "").map(argument => argument.trim()),
    reader
  });
}

/**
 * The XAML of a RenderTransform for a CSS function list. CSS applies the list
 * right to left (the last function acts on the element first) and a
 * TransformGroup left to right, so the group holds them reversed.
 */
function transformXaml(transforms: string[]) {
  const [only] = transforms;
  const isSingle = transforms.length === 1 && only !== undefined;
  if (isSingle) {
    return only;
  }

  return `<TransformGroup>${transforms.toReversed().join("")}</TransformGroup>`;
}

/**
 * `transform`: a list of translate, scale, rotate, skew and matrix functions,
 * set as the RenderTransform. It pivots about `transform-origin` like `scale`
 * and `rotate` do. WinUI's implicit transitions animate Translation, Scale and
 * Rotation and not a RenderTransform, so `transition: transform` does nothing.
 */
function transformProperty() {
  return {
    members: [MEMBER],
    lower(input) {
      const reader = input.reading(MEMBER);
      const words = splitWords(reader.declaration.value);
      const isNone = words.length === 1 && words[0]?.toLowerCase() === "none";
      if (isNone) {
        return [];
      }

      const parsed = words.map(word => parseFunction({
        word,
        reader
      }));
      const transforms = parsed.filter(xaml => xaml !== null);
      const hasFailed = transforms.length < parsed.length;
      if (hasFailed) {
        return [];
      }

      const isPivotWritten = ["transform-origin", "scale", "rotate"].some(member => input.computed.has(member));
      const pivot = isPivotWritten ? [] : [{
        kind: "write",
        target: ORIGIN_TARGET,
        value: DEFAULT_ORIGIN
      } as const];
      return [
        {
          kind: "content",
          property: "RenderTransform",
          xaml: transformXaml(transforms)
        } as const,
        ...pivot
      ];
    }
  } satisfies PropertyGroup;
}

/**
 * The property groups of `transform` and `transform-origin`. Apart from the
 * built-in groups, as the gradients are: a sheet that uses one registers them
 * (`registerPropertyGroups`), so a window with none carries no parser for them.
 */
export function transformGroups() {
  return [transformProperty(), transformOriginProperty(), defaultOriginProperty()];
}
