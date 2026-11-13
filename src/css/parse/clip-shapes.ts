import { splitSlash, splitWords } from "./split.ts";
import { parsePathData } from "./svg-path.ts";
import type { PathCommand } from "./svg-path.ts";
import { parseLength, parsePercent } from "./values.ts";
import { z } from "zod";

// The basic shapes of `clip-path`: `inset()` (with `round`), `circle()`,
// `ellipse()`, `polygon()` and `path()`. A shape is read at build time with its
// lengths and percentages as written; the window resolves it against the
// element's size (`resolveClipShape`), which is when the size is known.

const LENGTH = z.object({
  value: z.number(),
  isPercent: z.boolean()
});

const RADIUS = z.union([LENGTH, z.enum(["closest-side", "farthest-side"])]);

const CENTER = z.object({
  x: LENGTH,
  y: LENGTH
});

const RULE = z.enum(["nonzero", "evenodd"]);

const CLIP_SHAPE = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("inset"),
    top: LENGTH,
    right: LENGTH,
    bottom: LENGTH,
    left: LENGTH,
    radiiX: z.array(LENGTH),
    radiiY: z.array(LENGTH)
  }),
  z.object({
    kind: z.literal("circle"),
    radius: RADIUS,
    center: CENTER
  }),
  z.object({
    kind: z.literal("ellipse"),
    radiusX: RADIUS,
    radiusY: RADIUS,
    center: CENTER
  }),
  z.object({
    kind: z.literal("polygon"),
    rule: RULE,
    points: z.array(CENTER)
  }),
  z.object({
    kind: z.literal("path"),
    rule: RULE,
    data: z.string()
  })
]);

/** A `clip-path` basic shape, as written. */
export type ClipShape = z.infer<typeof CLIP_SHAPE>;

type Length = z.infer<typeof LENGTH>;

/** A shape in pixels of the element it clips, ready to be drawn. */
export type ResolvedClip =
  | {
    readonly kind: "ellipse";
    readonly x: number;
    readonly y: number;
    readonly radiusX: number;
    readonly radiusY: number;
  }
  | {
    readonly kind: "rounded";
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    /** The corners, from the top left clockwise. */
    readonly radii: readonly {
      readonly x: number;
      readonly y: number;
    }[];
  }
  | {
    readonly kind: "polygon";
    readonly rule: "nonzero" | "evenodd";
    readonly points: readonly {
      readonly x: number;
      readonly y: number;
    }[];
  }
  | {
    readonly kind: "path";
    readonly rule: "nonzero" | "evenodd";
    readonly commands: readonly PathCommand[];
  };

/** What reading a `clip-path` gives: the shape (null for `none`), or why it is not one. */
type ClipResult =
  | {
    readonly isValid: true;
    readonly shape: ClipShape | null;
  }
  | {
    readonly isValid: false;
    readonly reason: string;
  };

const SHAPE_FUNCTION = /^([a-z]+)\((.*)\)$/isu;
const CORNERS = 4;
const MAX_POSITION_WORDS = 2;
const HALF = 0.5;
const POSITION_KEYWORDS = new Map([
  ["left", 0],
  ["top", 0],
  ["center", HALF],
  ["right", 1],
  ["bottom", 1]
]);
const ZERO: Length = {
  value: 0,
  isPercent: false
};
const PERCENT_SCALE = 100;
const CENTERED: Length = {
  value: HALF * PERCENT_SCALE,
  isPercent: true
};
const GEOMETRY_BOXES = new Set(["border-box", "padding-box", "content-box", "margin-box", "fill-box", "stroke-box", "view-box"]);
const UNSUPPORTED = new Set(["rect", "xywh", "url"]);

function lengthOf(word: string) {
  const fraction = parsePercent(word);
  const isPercent = fraction !== null;
  if (isPercent) {
    return {
      value: fraction * PERCENT_SCALE,
      isPercent: true
    } satisfies Length;
  }

  const pixels = parseLength(word);
  return pixels === null ? null : {
    value: pixels,
    isPercent: false
  } satisfies Length;
}

function failure(reason: string) {
  return {
    isValid: false,
    reason
  } as const;
}

// One to four values, as the edges of a box take them: top, right, bottom, left.
function expandSides<Value>(values: readonly Value[]) {
  const [top, right = top, bottom = top, left = right] = values;
  return [top, right, bottom, left];
}

function lengthsOf(words: readonly string[]) {
  const lengths = words.map(word => lengthOf(word));
  return lengths.every(length => length !== null) ? lengths : null;
}

function hasCornerCount(lengths: readonly Length[] | null) {
  return lengths !== null && lengths.length >= 1 && lengths.length <= CORNERS;
}

function insetShape(argumentsText: string) {
  const [boxText = "", roundText] = argumentsText.split(/\s+round\s+/iu);
  const box = lengthsOf(splitWords(boxText));
  const isBoxValid = box !== null && box.length >= 1 && box.length <= CORNERS;
  if (!isBoxValid) {
    return failure("inset() takes one to four lengths or percentages, then optionally round and the radii");
  }

  const [top, right, bottom, left] = expandSides(box);
  const [horizontalText = "", verticalText] = splitSlash(roundText ?? "");
  const horizontal = roundText === undefined ? [ZERO] : lengthsOf(splitWords(horizontalText));
  const vertical = verticalText === undefined ? horizontal : lengthsOf(splitWords(verticalText));
  const hasSides = top !== undefined && right !== undefined && bottom !== undefined && left !== undefined;
  const isRadiusValid = hasCornerCount(horizontal) && hasCornerCount(vertical);
  const isInvalid = !isRadiusValid || !hasSides || horizontal === null || vertical === null;
  if (isInvalid) {
    return failure("inset() round takes one to four radii, optionally a slash and one to four more");
  }

  return {
    isValid: true,
    shape: {
      kind: "inset",
      top,
      right,
      bottom,
      left,
      radiiX: expandSides(horizontal).filter(radius => radius !== undefined),
      radiiY: expandSides(vertical).filter(radius => radius !== undefined)
    }
  } as const;
}

// One axis of a `<position>`: a keyword or a length.
function positionAxis(word: string) {
  const fraction = POSITION_KEYWORDS.get(word.toLowerCase());
  const isKeyword = fraction !== undefined;
  return isKeyword ? {
    value: fraction * PERCENT_SCALE,
    isPercent: true
  } satisfies Length : lengthOf(word);
}

// `<position>`: one or two words (a lone word is the horizontal axis, unless it is top or bottom).
function positionOf(words: readonly string[]) {
  const isTooLong = words.length > MAX_POSITION_WORDS;
  if (isTooLong) {
    return null;
  }

  const [first = "center", second] = words;
  const isVerticalFirst = ["top", "bottom"].includes(first.toLowerCase()) && second !== undefined && !["top", "bottom"].includes(second.toLowerCase());
  const [xWord, yWord] = isVerticalFirst ? [second ?? "center", first] : [first, second ?? "center"];
  const [x, y] = [positionAxis(xWord), positionAxis(yWord)];
  const isLoneVertical = words.length === 1 && ["top", "bottom"].includes(first.toLowerCase());
  if (isLoneVertical) {
    const lone = positionAxis(first);
    return lone === null ? null : {
      x: CENTERED,
      y: lone
    };
  }

  const isPlaced = x !== null && y !== null;
  return isPlaced ? {
    x,
    y
  } : null;
}

// The words before `at` and the position after it (centered when there is none).
function radiiAndCenter(argumentsText: string) {
  const words = splitWords(argumentsText);
  const iAt = words.findIndex(word => word.toLowerCase() === "at");
  const hasPosition = iAt >= 0;
  const radiusWords = hasPosition ? words.slice(0, iAt) : words;
  const center = hasPosition ? positionOf(words.slice(iAt + 1)) : {
    x: CENTERED,
    y: CENTERED
  };
  return {
    radiusWords,
    center
  };
}

function radiusOf(word: string) {
  const keyword = word.toLowerCase();
  const isKeyword = keyword === "closest-side" || keyword === "farthest-side";
  return isKeyword ? keyword : lengthOf(word);
}

function circleShape(argumentsText: string) {
  const { radiusWords, center } = radiiAndCenter(argumentsText);
  const radius = radiusWords.length === 0 ? "closest-side" : radiusOf(radiusWords[0] ?? "");
  const isValid = center !== null && radiusWords.length <= 1 && radius !== null;
  return isValid ? {
    isValid: true,
    shape: {
      kind: "circle",
      radius,
      center
    }
  } as const : failure("circle() takes an optional radius and an optional at position");
}

function ellipseShape(argumentsText: string) {
  const { radiusWords, center } = radiiAndCenter(argumentsText);
  const isDefault = radiusWords.length === 0;
  const radiusX = isDefault ? "closest-side" : radiusOf(radiusWords[0] ?? "");
  const radiusY = isDefault ? "closest-side" : radiusOf(radiusWords[1] ?? "");
  const isValid = center !== null && (isDefault || radiusWords.length === 2) && radiusX !== null && radiusY !== null;
  return isValid ? {
    isValid: true,
    shape: {
      kind: "ellipse",
      radiusX,
      radiusY,
      center
    }
  } as const : failure("ellipse() takes no radii or two, and an optional at position");
}

function polygonShape(argumentsText: string) {
  const [first = "", ...rest] = argumentsText.split(",").map(part => part.trim());
  const isRule = first === "nonzero" || first === "evenodd";
  const rule = isRule ? first : "nonzero";
  const pointTexts = isRule ? rest : [first, ...rest];
  const points = pointTexts.map(text => lengthsOf(splitWords(text)));
  const isValid = points.length >= 1 && points.every(point => point !== null && point.length === 2);
  if (!isValid) {
    return failure("polygon() takes an optional fill rule and points of two lengths or percentages, separated by commas");
  }

  return {
    isValid: true,
    shape: {
      kind: "polygon",
      rule,
      points: points.flatMap(point => {
        const [x, y] = point ?? [];
        const isPoint = x !== undefined && y !== undefined;
        return isPoint ? [{
          x,
          y
        }] : [];
      })
    }
  } as const;
}

function pathShape(argumentsText: string) {
  const match = /^(?:(nonzero|evenodd)\s*,\s*)?(["'])(.*)\2$/isu.exec(argumentsText.trim());
  const isQuoted = match !== null;
  if (!isQuoted) {
    return failure("path() takes an optional fill rule and the path data in quotes");
  }

  const [, ruleText = "nonzero", , data = ""] = match;
  const result = parsePathData(data);
  const rule = ruleText.toLowerCase() === "evenodd" ? "evenodd" : "nonzero";
  return result.isValid ? {
    isValid: true,
    shape: {
      kind: "path",
      rule,
      data
    }
  } as const : failure(`path(): ${result.reason}`);
}

const SHAPES = new Map<string, (argumentsText: string) => ClipResult>([
  ["inset", insetShape],
  ["circle", circleShape],
  ["ellipse", ellipseShape],
  ["polygon", polygonShape],
  ["path", pathShape]
]);

/**
 * A `clip-path` value: `none`, or one basic shape (with a geometry box
 * after it, which is ignored); `reason` says what is wrong with anything else.
 */
export function parseClipPath(text: string) {
  const words = splitWords(text.trim());
  const isNone = words.length === 1 && words[0]?.toLowerCase() === "none";
  if (isNone) {
    return {
      isValid: true,
      shape: null
    } as const;
  }

  const shapeWords = words.filter(word => !GEOMETRY_BOXES.has(word.toLowerCase()));
  const [shapeText = ""] = shapeWords;
  const match = SHAPE_FUNCTION.exec(shapeText);
  const name = (match?.[1] ?? "").toLowerCase();
  const isUnsupported = UNSUPPORTED.has(name);
  if (isUnsupported) {
    return failure(`${name}() has no WinUI meaning (inset, circle, ellipse, polygon and path have)`);
  }

  const read = SHAPES.get(name);
  const isUnknown = match === null || read === undefined || shapeWords.length !== 1;
  return isUnknown ? failure("expected none, inset(), circle(), ellipse(), polygon() or path()") : read(match[2] ?? "");
}

/** The shape a write of the CSS runtime carries, from its JSON. */
export function readClipShape(json: string) {
  return CLIP_SHAPE.parse(JSON.parse(json));
}

function lengthPixels({ length, reference }: {
  length: Length;
  reference: number;
}) {
  return length.isPercent ? length.value / PERCENT_SCALE * reference : length.value;
}

// A circle or ellipse radius along one axis (a percentage is of that axis' size).
function radiusPixels({ radius, reference, closest, farthest }: {
  radius: z.infer<typeof RADIUS>;
  reference: number;
  closest: number;
  farthest: number;
}) {
  const isClosest = radius === "closest-side";
  if (isClosest) {
    return closest;
  }

  const isFarthest = radius === "farthest-side";
  if (isFarthest) {
    return farthest;
  }

  return lengthPixels({
    length: radius,
    reference
  });
}

function cornerRadii({ shape, width, height }: {
  shape: Extract<ClipShape, { kind: "inset" }>;
  width: number;
  height: number;
}) {
  return Array.from({ length: CORNERS }, (_unused, iCorner) => ({
    x: lengthPixels({
      length: shape.radiiX[iCorner] ?? ZERO,
      reference: width
    }),
    y: lengthPixels({
      length: shape.radiiY[iCorner] ?? ZERO,
      reference: height
    })
  }));
}

/**
 * The shape against the size of the element it clips, in pixels: percentages
 * are of the width, the height (a circle's radius: of the root of the mean of
 * their squares), and `closest-side` and `farthest-side` of the center.
 */
export function resolveClipShape({ shape, width, height }: {
  shape: ClipShape;
  width: number;
  height: number;
}) {
  const isPolygon = shape.kind === "polygon";
  if (isPolygon) {
    return {
      kind: "polygon",
      rule: shape.rule,
      points: shape.points.map(point => ({
        x: lengthPixels({
          length: point.x,
          reference: width
        }),
        y: lengthPixels({
          length: point.y,
          reference: height
        })
      }))
    } satisfies ResolvedClip;
  }

  const isPath = shape.kind === "path";
  if (isPath) {
    const result = parsePathData(shape.data);
    return {
      kind: "path",
      rule: shape.rule,
      commands: result.isValid ? result.commands : []
    } satisfies ResolvedClip;
  }

  const isInset = shape.kind === "inset";
  if (isInset) {
    const [top, right, bottom, left] = [
      lengthPixels({
        length: shape.top,
        reference: height
      }),
      lengthPixels({
        length: shape.right,
        reference: width
      }),
      lengthPixels({
        length: shape.bottom,
        reference: height
      }),
      lengthPixels({
        length: shape.left,
        reference: width
      })
    ];
    return {
      kind: "rounded",
      x: left,
      y: top,
      width: Math.max(0, width - left - right),
      height: Math.max(0, height - top - bottom),
      radii: cornerRadii({
        shape,
        width,
        height
      })
    } satisfies ResolvedClip;
  }

  const [x, y] = [
    lengthPixels({
      length: shape.center.x,
      reference: width
    }),
    lengthPixels({
      length: shape.center.y,
      reference: height
    })
  ];
  const sides = {
    x: [Math.min(x, width - x), Math.max(x, width - x)],
    y: [Math.min(y, height - y), Math.max(y, height - y)]
  };
  const diagonal = Math.sqrt((width * width + height * height) / 2);
  const isCircle = shape.kind === "circle";
  if (isCircle) {
    const radius = radiusPixels({
      radius: shape.radius,
      reference: diagonal,
      closest: Math.min(...sides.x, ...sides.y),
      farthest: Math.max(...sides.x, ...sides.y)
    });
    return {
      kind: "ellipse",
      x,
      y,
      radiusX: radius,
      radiusY: radius
    } satisfies ResolvedClip;
  }

  return {
    kind: "ellipse",
    x,
    y,
    radiusX: radiusPixels({
      radius: shape.radiusX,
      reference: width,
      closest: sides.x[0] ?? 0,
      farthest: sides.x[1] ?? 0
    }),
    radiusY: radiusPixels({
      radius: shape.radiusY,
      reference: height,
      closest: sides.y[0] ?? 0,
      farthest: sides.y[1] ?? 0
    })
  } satisfies ResolvedClip;
}
