import { enumMap } from "./property-kit.ts";
import type { GroupInput, PropertyGroup } from "./property-kit.ts";

// `cursor`: the pointer shape over an element, as the ProtectedCursor of its
// UIElement (an InputSystemCursor). A WinUI element has no public Cursor
// property; the protected one is reached through IUIElementProtected.

const CURSOR = "cursor";
const CURSOR_TARGET = "cursor";

/** What a window does to an element's pointer shape: the seam of the write handler, so it runs under `node --test`. */
export interface CursorHost {
  /** Shows the shape (an `InputSystemCursorShape` name) over the control, or the default for null. */
  setCursor(input: {
    control: object;
    shape: string | null;
  }): void;
}

/** The `cursor` keywords, as the InputSystemCursorShape WinUI shows for each. */
const CURSOR_SHAPES = enumMap([
  ["auto", "Arrow"],
  ["default", "Arrow"],
  ["context-menu", "Arrow"],
  ["pointer", "Hand"],
  ["grab", "Hand"],
  ["grabbing", "Hand"],
  ["text", "IBeam"],
  ["vertical-text", "IBeam"],
  ["wait", "Wait"],
  ["progress", "Wait"],
  ["help", "Help"],
  ["not-allowed", "UniversalNo"],
  ["no-drop", "UniversalNo"],
  ["crosshair", "Cross"],
  ["cell", "Cross"],
  ["move", "SizeAll"],
  ["all-scroll", "SizeAll"],
  ["n-resize", "SizeNorthSouth"],
  ["s-resize", "SizeNorthSouth"],
  ["ns-resize", "SizeNorthSouth"],
  ["row-resize", "SizeNorthSouth"],
  ["e-resize", "SizeWestEast"],
  ["w-resize", "SizeWestEast"],
  ["ew-resize", "SizeWestEast"],
  ["col-resize", "SizeWestEast"],
  ["ne-resize", "SizeNortheastSouthwest"],
  ["sw-resize", "SizeNortheastSouthwest"],
  ["nesw-resize", "SizeNortheastSouthwest"],
  ["nw-resize", "SizeNorthwestSoutheast"],
  ["se-resize", "SizeNorthwestSoutheast"],
  ["nwse-resize", "SizeNorthwestSoutheast"]
]);

// A `url(...)` image has no WinUI counterpart, nor have the keywords left out of
// CURSOR_SHAPES (`none`, `copy`, `alias`, `zoom-in`, `zoom-out`): they are errors.
function lowerCursor(input: GroupInput) {
  const reader = input.reading(CURSOR);
  const word = reader.single();
  const isWordMissing = word === null;
  if (isWordMissing) {
    return [];
  }

  const shape = reader.keyword({
    token: word,
    choices: CURSOR_SHAPES
  });
  return shape === null ? [] : [{
    kind: "write",
    target: CURSOR_TARGET,
    value: shape
  } as const];
}

/** The members the cursor group is lowered from. */
export const CURSOR_MEMBERS = [CURSOR];

/**
 * The property group of `cursor`. `host` is what shows the shape: the window's
 * is `winui-svelte/css/cursor`'s; the build needs none.
 */
export function cursorGroups(host?: CursorHost) {
  return [{
    members: CURSOR_MEMBERS,
    lower: lowerCursor,
    writes: {
      [CURSOR_TARGET]({ control, value }) {
        const isHostMissing = host === undefined;
        if (isHostMissing) {
          return null;
        }

        host.setCursor({
          control,
          shape: value
        });
        return () => host.setCursor({
          control,
          shape: null
        });
      }
    }
  }] satisfies PropertyGroup[];
}
