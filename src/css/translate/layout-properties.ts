import { ElementType, enumMap, setter, simple } from "./property-kit.ts";
import type { GroupInput, Output, PropertyGroup } from "./property-kit.ts";
import type { Declaration } from "./types.ts";
import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parseNumber, splitWords } from "#src/css/parse/values.js";

const GRID_LINES = new Map<string, [string, string]>([
  ["grid-column", ["Grid.Column", "Grid.ColumnSpan"]],
  ["grid-row", ["Grid.Row", "Grid.RowSpan"]]
]);

const ALIGNMENTS = enumMap([
  ["start", "Start"],
  ["flex-start", "Start"],
  ["end", "End"],
  ["flex-end", "End"],
  ["center", "Center"],
  ["stretch", "Stretch"],
  ["normal", "Stretch"],
  ["auto", "Stretch"]
]);

const DISPLAY_KEYWORDS = new Set(["none", "block", "inline", "inline-block", "flex", "inline-flex", "grid", "inline-grid", "contents"]);

const SCROLL_BAR_VISIBILITIES = enumMap([
  ["auto", "Auto"],
  ["scroll", "Visible"],
  ["hidden", "Disabled"],
  ["clip", "Disabled"]
]);

/** `flex-direction`. */
export const flexDirections = enumMap([
  ["row", "Horizontal"],
  ["column", "Vertical"]
]);

/** `grid-template-columns` or `-rows`: the tracks as the renderer's `columns="Auto,*,2*,120"` spells them. */
export function gridTemplate({ target, member }: {
  target: "columns" | "rows";
  member: string;
}) {
  return {
    members: [member],
    lower(input) {
      const reader = input.reading(member);
      const tracks = splitWords(reader.declaration.value).flatMap(repeated);
      const lengths = tracks.map(track => gridLength({
        track,
        reader
      }));
      const isNone = reader.declaration.value.toLowerCase() === "none";
      const isUnusable = isNone || lengths.includes(null);
      if (isUnusable) {
        return isNone ? [{
          kind: "write",
          target,
          value: ""
        }] : [];
      }

      return [{
        kind: "write",
        target,
        value: lengths.join(",")
      }];
    }
  } satisfies PropertyGroup;
}

function repeated(track: string) {
  const match = /^repeat\(\s*(\d+)\s*,(.*)\)$/isu.exec(track);
  const isMatchMissing = match === null;
  if (isMatchMissing) {
    return [track];
  }

  const count = Number(match[1]);
  return Array.from({ length: count }, () => splitWords(match[2] ?? "")).flat();
}

function gridLength({ track, reader }: {
  track: string;
  reader: Reader;
}) {
  const lower = track.toLowerCase();
  const isAuto = lower === "auto";
  if (isAuto) {
    return "Auto";
  }

  const fraction = /^(\d*\.?\d+)fr$/u.exec(lower);
  const hasFraction = fraction !== null;
  if (hasFraction) {
    return Number(fraction[1]) === 1 ? "*" : `${fraction[1]}*`;
  }

  const pixels = parseLength(track);
  const hasPixels = pixels !== null;
  if (hasPixels) {
    return String(pixels);
  }

  const isMinMax = lower.startsWith("minmax(");
  const hint = isMinMax ? "minmax() has no WinUI meaning (a track is Auto, a size or a star)" : "an auto, a length in px, or a size in fr";
  return reader.expectedToken({
    what: hint,
    token: track
  });
}

/** `grid-column-start` and `-end` (or the row pair): a grid placement and span. */
export function gridPlacement(axis: "grid-column" | "grid-row") {
  const [position = "", span = ""] = GRID_LINES.get(axis) ?? [];
  const startMember = `${axis}-start`;
  const endMember = `${axis}-end`;
  return {
    members: [startMember, endMember],
    lower(input) {
      const outputs: Output[] = [];
      const start = parseLine(input.readers.get(startMember));
      const end = parseLine(input.readers.get(endMember));
      const hasSpan = start?.span !== undefined;
      if (hasSpan) {
        outputs.push(
          setter({
            property: span,
            value: String(start.span)
          })
        );
      } else if (start?.line !== undefined) {
        outputs.push(
          setter({
            property: position,
            value: String(start.line - 1)
          })
        );
      }

      const hasSpan2 = end?.span !== undefined;
      if (hasSpan2) {
        outputs.push(
          setter({
            property: span,
            value: String(end.span)
          })
        );
      } else {
        const endLine = end?.line;
        const startLine = start?.line;
        const hasBothLines = endLine !== undefined && startLine !== undefined;
        if (hasBothLines) {
          outputs.push(
            setter({
              property: span,
              value: String(endLine - startLine)
            })
          );
        }
      }

      return outputs;
    }
  } satisfies PropertyGroup;
}

function parseLine(reader: Reader | undefined) {
  const isReaderMissing = reader === undefined;
  if (isReaderMissing) {
    return undefined;
  }

  const value = reader.declaration.value.trim().toLowerCase();
  const isAuto = value === "auto";
  if (isAuto) {
    return {};
  }

  const spanMatch = /^span\s+(\d+)$/u.exec(value);
  const hasSpanMatch = spanMatch !== null;
  if (hasSpanMatch) {
    return { span: Number(spanMatch[1]) };
  }

  const line = parseNumber(value);
  const isLine = line !== null && Number.isInteger(line) && line >= 1;
  if (isLine) {
    return { line };
  }

  reader.expected("a positive line number, `span n` or auto");
  return undefined;
}

/** `align-self` and `justify-self`: CSS's start and end are WinUI's Top and Bottom, or Left and Right. */
export function alignmentProperty({ member, property, startName, endName }: {
  member: string;
  property: string;
  startName: string;
  endName: string;
}) {
  const names = new Map(ALIGNMENTS);
  const isHorizontal = property === "HorizontalAlignment";
  if (isHorizontal) {
    names.set("left", "Start");
    names.set("right", "End");
  }

  return simple({
    member,
    property,
    parse(reader) {
      const word = reader.single();
      const found = word === null ? null : reader.keyword({
        token: word,
        choices: names
      });
      const isFoundMissing = found === null;
      if (isFoundMissing) {
        return null;
      }

      const isStart = found === "Start";
      if (isStart) {
        return startName;
      }

      return found === "End" ? endName : found;
    }
  });
}

function orientationOf(computed: ReadonlyMap<string, Declaration>) {
  const direction = computed.get("flex-direction")?.value.toLowerCase();
  const isColumn = direction === "column";
  if (isColumn) {
    return "Vertical";
  }

  const isRow = direction === "row";
  if (isRow) {
    return "Horizontal";
  }

  const display = computed.get("display")?.value.toLowerCase() ?? "";
  return ["flex", "inline-flex"].includes(display) ? "Horizontal" : null;
}

function describeType(elementType: string | null) {
  return elementType === null ? "this element" : `<${elementType}>`;
}

/** `display`: `none` collapses; flex and grid are checked against the element's type. */
export function display(input: GroupInput) {
  const reader = input.reading("display");
  const word = reader.single()?.toLowerCase();
  const isWordMissing = word === undefined;
  if (isWordMissing) {
    return [];
  }

  if (!DISPLAY_KEYWORDS.has(word)) {
    reader.expectedToken({
      what: `one of ${[...DISPLAY_KEYWORDS].join(", ")}`,
      token: word
    });
    return [];
  }

  const isNone = word === "none";
  if (isNone) {
    return [setter({
      property: "Visibility",
      value: "Collapsed"
    })];
  }

  const { elementType } = input.options;
  const isFlex = word.endsWith("flex");
  const isGrid = word.endsWith("grid");
  const isKnownType = elementType !== null;
  const isFlexOnStack = elementType === ElementType.STACK_PANEL;
  const isGridOnGrid = elementType === ElementType.GRID;
  const isFlexOnWrongType = isFlex && isKnownType && !isFlexOnStack;
  if (isFlexOnWrongType) {
    reader.error(`display: ${word} has no WinUI meaning on ${describeType(elementType)} (a flex row or column is a <stack-panel>; use grid for two dimensions)`);
    return [];
  }

  const isGridOnWrongType = isGrid && isKnownType && !isGridOnGrid;
  if (isGridOnWrongType) {
    reader.error(`display: ${word} has no WinUI meaning on ${describeType(elementType)} (only a <grid> lays out in rows and columns)`);
    return [];
  }

  // flex-direction names the orientation when it is there.
  const hasDirection = input.computed.has("flex-direction");
  const isHorizontalStack = isFlex && isFlexOnStack && !hasDirection;
  return isHorizontalStack ? [setter({
    property: "Orientation",
    value: "Horizontal"
  })] : [];
}

function gapLength(reader: Reader | undefined) {
  return reader === undefined ? null : reader.length(reader.single() ?? "");
}

function gridSpacing({ row, column }: {
  row: string | null;
  column: string | null;
}) {
  return [
    ...row === null ? [] : [setter({
      property: "RowSpacing",
      value: row
    })],
    ...column === null ? [] : [setter({
      property: "ColumnSpacing",
      value: column
    })]
  ];
}

// A stack spaces its children along its orientation.
function stackSpacing({ input, row, column }: {
  input: GroupInput;
  row: string | null;
  column: string | null;
}) {
  const isVertical = (orientationOf(input.computed) ?? "Vertical") === "Vertical";
  const along = isVertical ? row : column;
  return along === null ? [] : [setter({
    property: "Spacing",
    value: along
  })];
}

/** `row-gap` and `column-gap`: a grid's RowSpacing and ColumnSpacing, or a stack's Spacing. */
export function gap(input: GroupInput) {
  const { elementType } = input.options;
  const rowReader = input.readers.get("row-gap");
  const columnReader = input.readers.get("column-gap");
  const row = gapLength(rowReader);
  const column = gapLength(columnReader);
  const isGrid = elementType === ElementType.GRID;
  if (isGrid) {
    return gridSpacing({
      row,
      column
    });
  }

  const isStack = elementType === ElementType.STACK_PANEL;
  if (isStack) {
    return stackSpacing({
      input,
      row,
      column
    });
  }

  const reader = rowReader ?? columnReader;
  const canReportGap = elementType !== null && reader !== undefined;
  if (canReportGap) {
    reader.error(`gap has no WinUI meaning on ${describeType(elementType)} (only <stack-panel> has Spacing and <grid> has RowSpacing and ColumnSpacing)`);
  }

  return [];
}

/** `overflow-x` and `overflow-y`: a scroll viewer's scroll bar visibility. */
export function overflow(input: GroupInput) {
  const outputs: Output[] = [];
  const axes: Array<[string, string]> = [
    ["overflow-x", "HorizontalScrollBarVisibility"],
    ["overflow-y", "VerticalScrollBarVisibility"]
  ];
  for (const [member, property] of axes) {
    const reader = input.readers.get(member);
    const word = reader?.single()?.toLowerCase();
    const isClipped = reader !== undefined && word !== undefined && word !== "visible";
    if (!isClipped) {
      continue;
    }

    const visibility = reader.keyword({
      token: word,
      choices: SCROLL_BAR_VISIBILITIES
    });
    const { elementType } = input.options;
    const isOnWrongType = visibility !== null && elementType !== null && elementType !== ElementType.SCROLL_VIEWER;
    if (isOnWrongType) {
      reader.error(`${member}: ${word} has no WinUI meaning on ${describeType(elementType)} (scrolling belongs to a <scroll-viewer>; WinUI has no Style value for clipping)`);
    } else if (visibility !== null) {
      outputs.push(
        setter({
          property,
          value: visibility
        })
      );
    }
  }

  return outputs;
}

/** `box-sizing`: a WinUI Width and Height include padding and border, so border-box is the only kind. */
export function boxSizing(input: GroupInput) {
  const reader = input.reading("box-sizing");
  const word = reader.single()?.toLowerCase();
  const isContentBox = word === "content-box";
  if (isContentBox) {
    reader.error("box-sizing: content-box has no WinUI meaning (a WinUI Width and Height include the padding and border, as border-box does; add the padding to the width)");
  }

  return [];
}
