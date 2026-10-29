import { SIDES } from "./box-properties.ts";
import { setter } from "./property-kit.ts";
import type { GroupInput, Output, PropertyGroup } from "./property-kit.ts";
import { expandBox } from "./shorthands.ts";
import type { Reader } from "#src/css/parse/reader.js";

const OFFSETS = SIDES;
const POSITION = "position";
const INSET = "inset";
const AUTO = "auto";
const ABSOLUTE_POSITIONS = new Set(["absolute", "fixed"]);
const STATIC_POSITIONS = new Set(["static", "relative", "sticky", ...ABSOLUTE_POSITIONS]);

/** The members `position` is lowered from: the offsets are longhands, `inset` expands to them. */
export const POSITION_MEMBERS = [POSITION, INSET, ...OFFSETS];

function offsetOf({ input, side }: {
  input: GroupInput;
  side: (typeof OFFSETS)[number];
}) {
  const reader = input.readers.get(side);
  const word = reader?.single();
  const isOffsetMissing = reader === undefined || word === undefined || word === null;
  if (isOffsetMissing) {
    return null;
  }

  const isAuto = word.toLowerCase() === AUTO;
  return isAuto ? null : {
    reader,
    pixels: Number(reader.pixels(word))
  };
}

function absolute(input: GroupInput) {
  const outputs: Output[] = [];
  const left = offsetOf({
    input,
    side: "left"
  });
  const top = offsetOf({
    input,
    side: "top"
  });
  for (const side of ["right", "bottom"] as const) {
    const found = offsetOf({
      input,
      side
    });
    found?.reader.error(`${side}: a canvas places by canvas-left and canvas-top; write left or top, or put the element in a grid cell with justify-self: end or align-self: end`);
  }

  const hasLeft = left !== null;
  if (hasLeft) {
    outputs.push(
      setter({
        property: "Canvas.Left",
        value: String(left.pixels)
      })
    );
  }

  const hasTop = top !== null;
  if (hasTop) {
    outputs.push(
      setter({
        property: "Canvas.Top",
        value: String(top.pixels)
      })
    );
  }

  return outputs;
}

// A relative offset moves the element without changing the layout, which is
// what Translation does (the same property `translate` sets).
function relative(input: GroupInput) {
  const left = offsetOf({
    input,
    side: "left"
  });
  const right = offsetOf({
    input,
    side: "right"
  });
  const top = offsetOf({
    input,
    side: "top"
  });
  const bottom = offsetOf({
    input,
    side: "bottom"
  });
  const x = left?.pixels ?? -(right?.pixels ?? 0);
  const y = top?.pixels ?? -(bottom?.pixels ?? 0);
  const hasMove = x !== 0 || y !== 0;
  if (!hasMove) {
    return [];
  }

  const [reader] = [left, right, top, bottom].flatMap(found => found?.reader ?? []);
  if (input.computed.has("translate")) {
    reader?.error("position: relative moves the element with Translation, which translate also sets; use one of them");
    return [];
  }

  return [setter({
    property: "Translation",
    value: `${x},${y},0`
  })];
}

function describeOffsets(input: GroupInput) {
  return OFFSETS.flatMap(side => input.readers.get(side) ?? []);
}

function lowerPosition(input: GroupInput) {
  const positionReader: Reader | undefined = input.readers.get(POSITION);
  const word = positionReader?.single()?.toLowerCase();
  const isKnown = word === undefined || STATIC_POSITIONS.has(word);
  if (!isKnown) {
    positionReader?.expected(`one of ${[...STATIC_POSITIONS].join(", ")}`);
    return [];
  }

  const [offsetReader] = describeOffsets(input);
  const isSticky = word === "sticky";
  if (isSticky) {
    positionReader?.error("position: sticky has no WinUI meaning (a ScrollViewer does not pin its children)");
    return [];
  }

  const isAbsolute = word !== undefined && ABSOLUTE_POSITIONS.has(word);
  if (isAbsolute) {
    return absolute(input);
  }

  const isRelative = word === "relative";
  if (isRelative) {
    return relative(input);
  }

  offsetReader?.warn("top, right, bottom and left are ignored without position: absolute or relative");
  return [];
}

/** `position` and `top`, `left`, `right`, `bottom`, `inset`: a canvas child's place, or a relative offset. */
export function positionGroup() {
  return {
    members: [POSITION, ...OFFSETS],
    lower: lowerPosition,
    shorthands: new Map([[INSET, ({ declaration, reader }) => expandBox({
      declaration,
      names: OFFSETS,
      reader,
      template: name => name
    })]])
  } satisfies PropertyGroup;
}

/** The position group as the list a sheet registers. */
export function positionGroups() {
  return [positionGroup()];
}
