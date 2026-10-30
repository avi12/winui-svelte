import type { Entry, Run } from "./container-run.ts";
import { addLine, fail } from "./container-run.ts";
import type { TemplateElement } from "./template-elements.ts";
import { splitWords } from "#src/css/parse/values.js";
import type { Declaration } from "#src/css/translate/types.js";

const ALIGN_ITEMS = "align-items";
const JUSTIFY_ITEMS = "justify-items";
const PLACE_ITEMS = "place-items";
const ALIGN_CONTENT = "align-content";
const JUSTIFY_CONTENT = "justify-content";
const PLACE_CONTENT = "place-content";
const DISPLAY = "display";
const DIRECTION = "flex-direction";
const WRAP = "flex-wrap";
const FILL = "1fr";
const HALF_FILL = "0.5fr";

const SELF_WORDS = new Map([
  ["self-start", "start"],
  ["self-end", "end"]
]);
const ALIGNMENT_WORDS: ReadonlySet<string> = new Set([
  "start",
  "end",
  "center",
  "stretch",
  "flex-start",
  "flex-end",
  "normal",
  ...SELF_WORDS.keys()
]);
const HORIZONTAL_ONLY: ReadonlySet<string> = new Set(["left", "right"]);

/** The properties of a container that are lowered into its children. */
export const CONTAINER_MEMBERS = [
  ALIGN_ITEMS,
  JUSTIFY_ITEMS,
  PLACE_ITEMS,
  ALIGN_CONTENT,
  JUSTIFY_CONTENT,
  PLACE_CONTENT
];

/** The properties that say what kind of container an element is. */
export const KIND_MEMBERS = [DISPLAY, DIRECTION, WRAP];

/** The values of `justify-content` and `align-content` that keep the children at the start, as WinUI's panels do. */
export const NO_DISTRIBUTION: ReadonlySet<string> = new Set(["normal", "stretch", "start", "flex-start", "left"]);

/** A container's properties as the cascade leaves them; each longhand of a shorthand is set in turn. */
export interface Folded {
  alignItems?: Entry;
  justifyItems?: Entry;
  alignContent?: Entry;
  justifyContent?: Entry;
  display?: Entry;
  direction?: Entry;
  wrap?: Entry;
}

const FOLDS = new Map<string, ReadonlyArray<keyof Folded>>([
  [ALIGN_ITEMS, ["alignItems"]],
  [JUSTIFY_ITEMS, ["justifyItems"]],
  [PLACE_ITEMS, ["alignItems", "justifyItems"]],
  [ALIGN_CONTENT, ["alignContent"]],
  [JUSTIFY_CONTENT, ["justifyContent"]],
  [PLACE_CONTENT, ["alignContent", "justifyContent"]],
  [DISPLAY, ["display"]],
  [DIRECTION, ["direction"]],
  [WRAP, ["wrap"]]
]);

/** The container properties among `declarations`, the last one of each winning. */
export function foldContainer(declarations: readonly Declaration[]) {
  const folded: Folded = {};
  for (const declaration of declarations) {
    const keys = FOLDS.get(declaration.property) ?? [];
    const words = splitWords(declaration.value.toLowerCase());
    for (const [i, key] of keys.entries()) {
      folded[key] = {
        value: words[i] ?? words[0] ?? "",
        declaration
      };
    }
  }

  return folded;
}

/** One axis of alignment for every child: the value is checked, and `self-start` and `self-end` are start and end. */
export function alignChildren({ run, entry, property, children }: {
  run: Run;
  entry: Entry;
  property: "align-self" | "justify-self";
  children: readonly TemplateElement[];
}) {
  const word = entry.value;
  const isHorizontalWord = HORIZONTAL_ONLY.has(word) && property === "justify-self";
  const isKnown = ALIGNMENT_WORDS.has(word) || isHorizontalWord;
  if (!isKnown) {
    fail({
      run,
      declaration: entry.declaration,
      message: `${entry.declaration.property}: ${word} has no WinUI meaning (WinUI aligns a child to start, end, center or stretch)`
    });
    return;
  }

  const value = SELF_WORDS.get(word) ?? word;
  for (const child of children) {
    addLine({
      run,
      element: child,
      line: `${property}: ${value}`
    });
  }
}

/** A `justify-content` or `align-content` on a container that keeps its children at the start. */
export function keepAtStart({ run, entry, reason }: {
  run: Run;
  entry: Entry | undefined;
  reason: string;
}) {
  const isMoved = entry !== undefined && !NO_DISTRIBUTION.has(entry.value);
  if (isMoved) {
    fail({
      run,
      declaration: entry.declaration,
      message: `${entry.declaration.property}: ${entry.value} has no WinUI meaning here (${reason})`
    });
  }
}

/** The spacer tracks a `justify-content` puts around and between a flex container's tracks. */
export interface Distribution {
  leading: string | null;
  between: string | null;
  trailing: string | null;
}

/** No spacer tracks. */
export const NO_SPACE: Distribution = {
  leading: null,
  between: null,
  trailing: null
};

const END_SPACE: Distribution = {
  leading: FILL,
  between: null,
  trailing: null
};

/** The values of `justify-content` that need spacer tracks, with the tracks. */
export const DISTRIBUTIONS = new Map<string, Distribution>([
  ["end", END_SPACE],
  ["flex-end", END_SPACE],
  ["right", END_SPACE],
  ["center", {
    leading: FILL,
    between: null,
    trailing: FILL
  }],
  ["space-between", {
    leading: null,
    between: FILL,
    trailing: null
  }],
  ["space-around", {
    leading: HALF_FILL,
    between: FILL,
    trailing: HALF_FILL
  }],
  ["space-evenly", {
    leading: FILL,
    between: FILL,
    trailing: FILL
  }]
]);
