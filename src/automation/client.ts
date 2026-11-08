import { UiaElementUnavailableError } from "./backend.ts";
import type { UiaBackend, UiaHandle, UiaProperties } from "./backend.ts";
import { UiaPatternName } from "./ids.ts";

const DEFAULT_MAX_ELEMENTS = 400;
const DEFAULT_MAX_MILLISECONDS = 400;
const DEFAULT_MAX_TEXT_LENGTH = 12_000;

/** Why a walk ended. */
export const UiaWalkEnd = {
  complete: "complete",
  maxElements: "maxElements",
  deadline: "deadline"
} as const;

/** One reason a walk ended. */
export type UiaWalkEnd = typeof UiaWalkEnd[keyof typeof UiaWalkEnd];

/** The client was used after its `withUiaClient` call ended. */
export class UiaScopeEndedError extends Error {
  override name = "UiaScopeEndedError";
}

/** A call into a target process did not answer in time. */
export class UiaTimeout extends Error {
  override name = "UiaTimeout";
}

/** A range of text inside a text pattern. */
export interface UiaTextRange {
  /**
   * The text of the range.
   *
   * @param maxLength - The most characters to take; the text is cut there.
   */
  getText(maxLength?: number): string;
}

/** The text pattern of an element (browsers, Word, Notepad, the editor of VS Code). */
export interface UiaTextPattern {
  /** The ranges that are on screen; the text beneath the element is covered by them. */
  visibleRanges(): readonly UiaTextRange[];
  documentRange(): UiaTextRange | null;
}

/** The value pattern of an element (an edit box). */
export interface UiaValuePattern {
  readonly value: string;
}

/** The patterns an element can offer, by name. */
export interface UiaPatterns {
  readonly text: UiaTextPattern;
  readonly value: UiaValuePattern;
}

/** An element of another application, valid inside its `withUiaClient` call only. */
export interface UiaElement {
  /** The properties, read again from the target (a walk's nodes also carry the cached ones). */
  properties(): UiaProperties;

  /** The pattern, or null when the element does not offer it. */
  pattern<Name extends UiaPatternName>(name: Name): UiaPatterns[Name] | null;
}

/** An element the walk visited. */
export interface UiaNode extends UiaElement {
  readonly depth: number;

  /** Do not walk into this element: its text pattern already covers what is beneath it. */
  skipSubtree(): void;

  /** The properties as the walk read them, with no further call. */
  readonly cached: UiaProperties;
}

/** The options of `client.walk`. */
export interface UiaWalkOptions {
  readonly root: UiaElement;

  /** The most elements to visit; 400 by default. */
  readonly maxElements?: number;

  /** The soft deadline: the walk stops and keeps what it has; 400 by default. */
  readonly maxMilliseconds?: number;

  /** Return false to skip an element and its subtree; the default visits all. */
  readonly shouldVisit?: (properties: UiaProperties) => boolean;
}

/** A walk: iterate it, then read `end`. */
export interface UiaWalk extends Iterable<UiaNode> {
  /** Why the walk ended; `complete` until it has. */
  readonly end: UiaWalkEnd;
}

/** What `withUiaClient` hands to its callback. */
export interface UiaClient {
  /** The element of a window, or null when the window cannot be read (gone, or elevated). */
  elementFromHandle(hwnd: bigint): UiaElement | null;

  /** The element that has the keyboard focus, or null. */
  focusedElement(): UiaElement | null;

  /**
   * A breadth first walk of the control view below the root. An element that
   * went away is skipped, never thrown.
   */
  walk(options: UiaWalkOptions): UiaWalk;
}

function stopOf({ startedAt, maxMilliseconds, isFull }: {
  readonly startedAt: number;
  readonly maxMilliseconds: number;
  readonly isFull: boolean;
}) {
  const isOverDeadline = performance.now() - startedAt > maxMilliseconds;
  if (isOverDeadline) {
    return UiaWalkEnd.deadline;
  }

  return isFull ? UiaWalkEnd.maxElements : null;
}

function nullIfUnavailable<T>(read: () => T) {
  try {
    return read();
  } catch (error) {
    const isUnavailable = error instanceof UiaElementUnavailableError;
    if (isUnavailable) {
      return null;
    }

    throw error;
  }
}

/**
 * Makes a UI Automation client over a backend and gives it to `use`; every
 * element, range and COM pointer it made is released when `use` ends, and the
 * elements then refuse to work (`UiaScopeEndedError`).
 *
 * @param options - `use`: the work; `backend`: the calls into UI Automation.
 * @returns What `use` returned.
 */
export async function runUiaClient<T>({ use, backend }: {
  readonly use: (client: UiaClient) => T | Promise<T>;
  readonly backend: UiaBackend;
}) {
  let isAlive = true;
  const handles = new WeakMap<UiaElement, UiaHandle>();

  function assertAlive() {
    if (!isAlive) {
      throw new UiaScopeEndedError("the UI Automation client ended with its withUiaClient call");
    }
  }

  function rangeOf(range: UiaHandle) {
    const textRange: UiaTextRange = {
      getText(maxLength = DEFAULT_MAX_TEXT_LENGTH) {
        assertAlive();
        return backend.rangeText({
          range,
          maxLength
        });
      }
    };
    return textRange;
  }

  function textPatternOf(handle: UiaHandle) {
    const isSupported = backend.visibleRanges(handle) !== null;
    if (!isSupported) {
      return null;
    }

    const pattern: UiaTextPattern = {
      visibleRanges() {
        assertAlive();
        return (backend.visibleRanges(handle) ?? []).map(rangeOf);
      },
      documentRange() {
        assertAlive();
        const range = backend.documentRange(handle);
        return range === null ? null : rangeOf(range);
      }
    };
    return pattern;
  }

  function valuePatternOf(handle: UiaHandle) {
    const isSupported = backend.value(handle) !== null;
    if (!isSupported) {
      return null;
    }

    const pattern: UiaValuePattern = {
      get value() {
        assertAlive();
        return backend.value(handle) ?? "";
      }
    };
    return pattern;
  }

  function elementOf(handle: UiaHandle) {
    const element: UiaElement = {
      properties() {
        assertAlive();
        return backend.properties(handle);
      },
      pattern<Name extends UiaPatternName>(name: Name) {
        assertAlive();
        const isText = name === UiaPatternName.text;
        const pattern = isText ? textPatternOf(handle) : valuePatternOf(handle);
        // oxlint-disable-next-line typescript/consistent-type-assertions -- the name picks the pattern
        return pattern as UiaPatterns[Name] | null;
      }
    };
    handles.set(element, handle);
    return element;
  }

  function handleOf(element: UiaElement) {
    const handle = handles.get(element);
    const isForeign = handle === undefined;
    if (isForeign) {
      throw new TypeError("the root is not an element of this client");
    }

    return handle;
  }

  function wrap(handle: UiaHandle | null) {
    return handle === null ? null : elementOf(handle);
  }

  function walk({
    root,
    maxElements = DEFAULT_MAX_ELEMENTS,
    maxMilliseconds = DEFAULT_MAX_MILLISECONDS,
    shouldVisit
  }: UiaWalkOptions) {
    assertAlive();
    const rootHandle = handleOf(root);

    let end: UiaWalkEnd = UiaWalkEnd.complete;

    function* nodes() {
      const startedAt = performance.now();
      const queue = [{
        handle: rootHandle,
        depth: 0
      }];
      let visited = 0;
      for (const { handle, depth } of queue) {
        const children = nullIfUnavailable(() => backend.children(handle)) ?? [];
        for (const child of children) {
          assertAlive();
          const stop = stopOf({
            startedAt,
            maxMilliseconds,
            isFull: visited >= maxElements
          });
          const isStopped = stop !== null;
          if (isStopped) {
            end = stop;
            return;
          }

          const isSkipped = shouldVisit !== undefined && !shouldVisit(child.properties);
          if (isSkipped) {
            continue;
          }

          visited += 1;
          let isPruned = false;
          const node: UiaNode = {
            ...elementOf(child.handle),
            depth: depth + 1,
            cached: child.properties,
            skipSubtree() {
              isPruned = true;
            }
          };
          handles.set(node, child.handle);
          yield node;

          if (!isPruned) {
            queue.push({
              handle: child.handle,
              depth: depth + 1
            });
          }
        }
      }
    }

    const walkResult: UiaWalk = {
      get end() {
        return end;
      },
      [Symbol.iterator]: nodes
    };
    return walkResult;
  }

  const client: UiaClient = {
    elementFromHandle(hwnd) {
      assertAlive();
      return wrap(nullIfUnavailable(() => backend.elementFromHandle(hwnd)));
    },
    focusedElement() {
      assertAlive();
      return wrap(nullIfUnavailable(() => backend.focusedElement()));
    },
    walk
  };

  try {
    return await use(client);
  } finally {
    isAlive = false;
    backend.dispose();
  }
}
