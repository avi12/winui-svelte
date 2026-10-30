import type { Expansion, ExpansionInput, PropertyGroup } from "./property-kit.ts";
import { expandPair, longhand, MAX_BOX_VALUES } from "./shorthands.ts";
import { splitSlash } from "#src/css/parse/values.js";

const GRID_LINE = /^(auto|\d+|span\s+\d+)$/iu;

const LOGICAL_SIDES: ReadonlyArray<readonly [string, string]> = [
  ["inline-start", "left"],
  ["inline-end", "right"],
  ["block-start", "top"],
  ["block-end", "bottom"]
];
const LOGICAL_PAIRS: ReadonlyArray<readonly [string, readonly [string, string]]> = [
  ["inline", ["left", "right"]],
  ["block", ["top", "bottom"]]
];
const LOGICAL_SIZES: ReadonlyArray<readonly [string, string]> = [
  ["inline-size", "width"],
  ["block-size", "height"]
];
const BOX_PROPERTIES = ["margin", "padding"];
const SIZE_PREFIXES = ["", "min-", "max-"];

function renamed(property: string) {
  return ({ declaration }: ExpansionInput) => [longhand({
    declaration,
    property,
    value: declaration.value
  })];
}

const logicalExpansions: ReadonlyArray<readonly [string, Expansion]> = [
  ...BOX_PROPERTIES.flatMap(box => LOGICAL_SIDES.map(([logical, physical]) => [`${box}-${logical}`, renamed(`${box}-${physical}`)] as const)),
  ...BOX_PROPERTIES.flatMap(box => LOGICAL_PAIRS.map(([logical, [first, second]]) => [`${box}-${logical}`, ({ declaration, reader }: ExpansionInput) => expandPair({
    declaration,
    reader,
    names: [`${box}-${first}`, `${box}-${second}`]
  })] as const)),
  ...SIZE_PREFIXES.flatMap(prefix => LOGICAL_SIZES.map(([logical, physical]) => [`${prefix}${logical}`, renamed(`${prefix}${physical}`)] as const))
];

function expandArea({ declaration, reader }: ExpansionInput) {
  const lines = splitSlash(declaration.value);
  const isNumbered = lines.length <= MAX_BOX_VALUES && lines.every(line => GRID_LINE.test(line));
  if (!isNumbered) {
    reader.expected("lines separated by /, such as 2 / 3 / span 2 / span 2 (named grid areas have no WinUI meaning: a grid has no grid-template-areas)");
    return [];
  }

  const [rowStart = "", columnStart = "auto", rowEnd = "auto", columnEnd = "auto"] = lines;
  const placements: Array<[string, string]> = [
    ["grid-row-start", rowStart],
    ["grid-column-start", columnStart],
    ["grid-row-end", rowEnd],
    ["grid-column-end", columnEnd]
  ];
  return placements.map(([property, value]) => longhand({
    declaration,
    property,
    value
  }));
}

const buildExpansions = new Map<string, Expansion>([...logicalExpansions, ["grid-area", expandArea]]);

/**
 * The shorthands only the build expands: the logical properties (`margin-inline`,
 * `padding-block-start`, `inline-size`...) as their physical counterparts, and
 * `grid-area`. A sheet reaches a window already expanded, so these are no part of
 * its runtime; a `style` attribute has no use of them.
 */
export function buildShorthandGroups() {
  return [{
    members: [],
    lower: () => [],
    shorthands: buildExpansions
  } satisfies PropertyGroup];
}
