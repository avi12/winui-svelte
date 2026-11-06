import type { GroupInput, PropertyGroup } from "./property-kit.ts";

// `view-transition-name`: the name `document.startViewTransition` pairs an
// element by, the element named alike before the update flying to the one
// named alike after it as a WinUI connected animation. The name is kept on the
// control (src/renderer/host/view-transition-names.ts); no Style sets it.

const VIEW_TRANSITION_NAME = "view-transition-name";
const NAME_TARGET = "view-transition-name";
const NO_NAME = "none";
const CUSTOM_IDENT = /^-?[a-z_][\w-]*$/iu;
// The keywords no name may be, and the two that ask the browser to make one up,
// which WinUI cannot: a connected animation is found by its key alone.
const RESERVED = new Set(["auto", "match-element", "initial", "inherit", "unset", "revert", "revert-layer", "default"]);

/** What a window does with a name: the seam of the write handler, so it runs under `node --test`. */
export interface ViewTransitionHost {
  /** Names the control; returns what takes the name away. */
  name(input: {
    control: object;
    name: string;
  }): () => void;
}

function lowerName(input: GroupInput) {
  const reader = input.reading(VIEW_TRANSITION_NAME);
  const word = reader.single();
  const isNone = word === null || word.toLowerCase() === NO_NAME;
  if (isNone) {
    return [];
  }

  const isReserved = RESERVED.has(word.toLowerCase());
  if (isReserved) {
    reader.error(`${VIEW_TRANSITION_NAME}: "${word}" is not supported; give each element a name of its own, such as photo-3`);
    return [];
  }

  const isName = CUSTOM_IDENT.test(word);
  if (!isName) {
    reader.expected("none or a name such as hero");
    return [];
  }

  return [{
    kind: "write",
    target: NAME_TARGET,
    value: word
  } as const];
}

/** The members the view transition group is lowered from. */
export const VIEW_TRANSITION_MEMBERS = [VIEW_TRANSITION_NAME];

/**
 * The property group of `view-transition-name`. `host` is what keeps the
 * name: the window's is `winui-svelte/css/view-transition`'s; the build needs none.
 */
export function viewTransitionGroups(host?: ViewTransitionHost) {
  return [{
    members: VIEW_TRANSITION_MEMBERS,
    lower: lowerName,
    writes: {
      [NAME_TARGET]: ({ control, value }) => host === undefined ? null : host.name({
        control,
        name: value
      })
    }
  }] satisfies PropertyGroup[];
}
