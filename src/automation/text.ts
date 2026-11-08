import type { UiaProperties } from "./backend.ts";
import type { UiaClient, UiaElement, UiaWalkEnd } from "./client.ts";
import { UiaControlType, UiaPatternName } from "./ids.ts";
import { createHash } from "node:crypto";

const DEFAULT_MAX_CHARACTERS = 12_000;
const VERSION_LENGTH = 16;

/** The control types that are window chrome, not content: their subtree is skipped. */
export const UIA_CHROME_CONTROL_TYPES: ReadonlySet<number> = new Set([
  UiaControlType.button,
  UiaControlType.splitButton,
  UiaControlType.menu,
  UiaControlType.menuBar,
  UiaControlType.menuItem,
  UiaControlType.toolBar,
  UiaControlType.tab,
  UiaControlType.tabItem,
  UiaControlType.scrollBar,
  UiaControlType.statusBar,
  UiaControlType.titleBar,
  UiaControlType.image,
  UiaControlType.separator,
  UiaControlType.thumb
]);

/** The kinds of block a window's text is made of. */
export const TextBlockKind = {
  heading: "heading",
  text: "text"
} as const;

/** One kind of text block. */
export type TextBlockKind = typeof TextBlockKind[keyof typeof TextBlockKind];

/** A piece of the text of a window. */
export interface TextBlock {
  readonly kind: TextBlockKind;

  /** 1 to 9 for a heading, 0 for text. */
  readonly level: number;
  readonly text: string;
}

/** The text of a window as UI Automation reports it. */
export interface WindowText {
  readonly title: string;
  readonly blocks: readonly TextBlock[];

  /** Sixteen characters that change when the title or a block changes. */
  readonly version: string;

  /** Why the walk ended; anything but `complete` means the text may be cut. */
  readonly end: UiaWalkEnd;
}

/** The options of `readWindowText`. */
export interface ReadWindowTextOptions {
  /** The most elements to visit; 400 by default. */
  readonly maxElements?: number;

  /** The soft deadline of the walk; 400 by default. */
  readonly maxMilliseconds?: number;

  /** The most characters of text in all; 12 000 by default. */
  readonly maxCharacters?: number;
}

function textOf(value: string) {
  return value.replaceAll("￼", "").trim();
}

function blocksOf({ node, remaining }: {
  readonly node: {
    readonly cached: UiaProperties;
    pattern: UiaElement["pattern"];
    skipSubtree(): void;
  };
  readonly remaining: number;
}) {
  const { cached } = node;
  const isHeading = cached.headingLevel > 0;
  if (cached.hasTextPattern) {
    node.skipSubtree();
    const ranges = node.pattern(UiaPatternName.text)?.visibleRanges() ?? [];
    return ranges
      .map(range => textOf(range.getText(remaining)))
      .filter(text => text !== "")
      .map(text => ({
        kind: TextBlockKind.text,
        level: 0,
        text
      }));
  }

  const isEdit = cached.controlType === UiaControlType.edit && cached.hasValuePattern;
  if (isEdit) {
    const text = textOf(node.pattern(UiaPatternName.value)?.value ?? "");
    return text === "" ? [] : [{
      kind: TextBlockKind.text,
      level: 0,
      text
    }];
  }

  const isTextType = cached.controlType === UiaControlType.text || cached.controlType === UiaControlType.listItem;
  const isNamedText = isHeading || isTextType;
  const text = textOf(cached.name);
  const isBlock = isNamedText && text !== "";
  return isBlock ? [{
    kind: isHeading ? TextBlockKind.heading : TextBlockKind.text,
    level: cached.headingLevel,
    text
  }] : [];
}

/**
 * Reads the text of a window: headings and the exact copy of the text beneath
 * the chrome, through the control view. Elements that are off screen and
 * window chrome (buttons, menus, tool bars, tabs, scroll bars, status bars,
 * images) are skipped; an element with a text pattern gives its visible
 * ranges and its subtree is not walked again.
 *
 * @param options - `client`: the client of a `withUiaClient` call; `root`: the window's element; the limits.
 * @returns The title, the blocks and a version that changes with the text.
 */
export function readWindowText({
  client,
  root,
  maxElements,
  maxMilliseconds,
  maxCharacters = DEFAULT_MAX_CHARACTERS
}: ReadWindowTextOptions & {
  readonly client: UiaClient;
  readonly root: UiaElement;
}) {
  const blocks: TextBlock[] = [];
  let used = 0;
  const walk = client.walk({
    root,
    ...maxElements === undefined ? {} : { maxElements },
    ...maxMilliseconds === undefined ? {} : { maxMilliseconds },
    shouldVisit: ({ isOffscreen, controlType }) => !isOffscreen && !UIA_CHROME_CONTROL_TYPES.has(controlType)
  });
  for (const node of walk) {
    const remaining = maxCharacters - used;
    const isFull = remaining <= 0;
    if (isFull) {
      break;
    }

    for (const block of blocksOf({
      node,
      remaining
    })) {
      blocks.push(block);
      used += block.text.length;
    }
  }

  const title = root.properties().name;
  const hash = createHash("sha256").update(title);
  for (const block of blocks) {
    hash.update(`\n${block.level}:${block.text}`);
  }

  const windowText: WindowText = {
    title,
    blocks,
    version: hash.digest("hex").slice(0, VERSION_LENGTH),
    end: walk.end
  };
  return windowText;
}
