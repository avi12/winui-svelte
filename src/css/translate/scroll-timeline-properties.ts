import type {
  ExpansionInput,
  GroupInput,
  Output,
  PropertyGroup,
  WriteContext
} from "./property-kit.ts";
import { readDefinition, readLinked, writeDefinition } from "./scroll-link.ts";
import type { LinkedAnimation, TimelineDefinition } from "./scroll-link.ts";
import { longhand } from "./shorthands.ts";
import { parseAxis, parseTimelineName, parseViewInset, TimelineKind } from "#src/css/parse/scroll-timeline.js";
import type { ViewInset } from "#src/css/parse/scroll-timeline.js";
import { splitWords } from "#src/css/parse/values.js";

// `scroll-timeline` and `view-timeline` with their longhands: the timelines an
// element defines for the animations of its descendants (`animation-timeline:
// --name`). The animation side (`animation-timeline`, `animation-range`) is in
// animation-properties.ts. A window links an animation to a scroll viewer
// (src/win2d/scroll-link.ts); the build needs no host.

const SCROLL_NAME = "scroll-timeline-name";
const SCROLL_AXIS = "scroll-timeline-axis";
const SCROLL_TIMELINE = "scroll-timeline";
const VIEW_NAME = "view-timeline-name";
const VIEW_AXIS = "view-timeline-axis";
const VIEW_INSET = "view-timeline-inset";
const VIEW_TIMELINE = "view-timeline";
const DEFINITION_TARGET = "timeline-definition";
const LINKED_TARGET = "scroll-animation";
const NO_NAME = "none";
const DEFAULT_INSET = "auto";
const DEFAULT_AXIS = "block";
const AUTO_INSET = {
  isAuto: true,
  offset: {
    pixels: 0,
    fraction: 0
  }
} as const;
const NO_INSET: ViewInset = {
  start: AUTO_INSET,
  end: AUTO_INSET
};

/** What a window does for scroll-driven animation: the seam of the write handlers, so they run under `node --test`. */
export interface ScrollHost {
  /** Makes the control a scroller or subject that descendants name; returns what takes the definition away. */
  define(input: {
    control: object;
    definition: TimelineDefinition;
  }): () => void;

  /** Links the control's animations to their timelines; returns what unlinks them and puts the values back. */
  link(input: {
    control: object;
    animations: readonly LinkedAnimation[];
  }): () => void;
}

/** The members the scroll timeline group is lowered from. */
export const SCROLL_TIMELINE_MEMBERS = [SCROLL_NAME, SCROLL_AXIS, VIEW_NAME, VIEW_AXIS, VIEW_INSET] as const;

// `<name> [<axis>]`, and for a view timeline `<name> [<axis> || <inset>]`.
function expandTimeline({ names, declaration, reader }: ExpansionInput & {
  names: {
    name: string;
    axis: string;
    inset?: string;
  };
}) {
  const [name = NO_NAME, ...rest] = splitWords(declaration.value);
  const axisWord = rest.find(word => parseAxis(word) !== null);
  const insetWords = rest.filter(word => word !== axisWord);
  const isReadable = names.inset !== undefined || insetWords.length === 0;
  if (!isReadable) {
    reader.error(`${declaration.property}: expected a name and an axis, found "${declaration.value}"`);
    return [];
  }

  return [
    longhand({
      declaration,
      property: names.name,
      value: name
    }),
    longhand({
      declaration,
      property: names.axis,
      value: axisWord ?? DEFAULT_AXIS
    }),
    ...names.inset === undefined ? [] : [longhand({
      declaration,
      property: names.inset,
      value: insetWords.length === 0 ? DEFAULT_INSET : insetWords.join(" ")
    })]
  ];
}

function axisOf({ input, member }: {
  input: GroupInput;
  member: string;
}) {
  const declaration = input.computed.get(member);
  const axis = parseAxis(declaration?.value.trim() ?? DEFAULT_AXIS);
  return axis ?? input.reading(member).expected("block, inline, x or y");
}

function nameOf({ input, member }: {
  input: GroupInput;
  member: string;
}) {
  const reader = input.reading(member);
  const parsed = parseTimelineName(reader.declaration.value);
  return parsed.isValid ? parsed.value : reader.error(`${member}: ${parsed.reason}`);
}

function insetOf(input: GroupInput) {
  const declaration = input.computed.get(VIEW_INSET);
  const isWritten = declaration !== undefined;
  if (!isWritten) {
    return NO_INSET;
  }

  const parsed = parseViewInset(declaration.value);
  return parsed.isValid ? parsed.value : input.reading(VIEW_INSET).error(`${VIEW_INSET}: ${parsed.reason}`);
}

function definitionOf({ input, kind }: {
  input: GroupInput;
  kind: typeof TimelineKind.SCROLL | typeof TimelineKind.VIEW;
}) {
  const isScroll = kind === TimelineKind.SCROLL;
  const nameMember = isScroll ? SCROLL_NAME : VIEW_NAME;
  const axisMember = isScroll ? SCROLL_AXIS : VIEW_AXIS;
  if (!input.computed.has(nameMember)) {
    return null;
  }

  const name = nameOf({
    input,
    member: nameMember
  });
  const axis = axisOf({
    input,
    member: axisMember
  });
  const inset = isScroll ? NO_INSET : insetOf(input);
  const isDefined = name !== null && axis !== null && inset !== null;
  return isDefined ? {
    name,
    kind,
    axis,
    inset
  } satisfies TimelineDefinition : null;
}

function lowerTimelines(input: GroupInput) {
  const kinds = [TimelineKind.SCROLL, TimelineKind.VIEW] as const;
  return kinds.flatMap(kind => {
    const found = definitionOf({
      input,
      kind
    });
    return found === null ? [] : [{
      kind: "write",
      target: DEFINITION_TARGET,
      value: writeDefinition(found)
    } as const satisfies Output];
  });
}

function define({ host, context }: {
  host: ScrollHost;
  context: WriteContext;
}) {
  const found = readDefinition(context.value);
  return found === null ? null : host.define({
    control: context.control,
    definition: found
  });
}

/**
 * The property group of `scroll-timeline`, `view-timeline` and their
 * longhands, and the handler of the animations `animation-timeline` linked.
 * Apart from the built-in groups so a window whose sheets use none carries
 * none of it (nor Composition's expressions). `host` is what links them: the
 * window's is `winui-svelte/css/scroll-timeline`'s; the build needs none.
 */
export function scrollTimelineGroups(host?: ScrollHost) {
  return [{
    members: [...SCROLL_TIMELINE_MEMBERS],
    lower: lowerTimelines,
    shorthands: new Map([
      [SCROLL_TIMELINE, (input: ExpansionInput) => expandTimeline({
        ...input,
        names: {
          name: SCROLL_NAME,
          axis: SCROLL_AXIS
        }
      })],
      [VIEW_TIMELINE, (input: ExpansionInput) => expandTimeline({
        ...input,
        names: {
          name: VIEW_NAME,
          axis: VIEW_AXIS,
          inset: VIEW_INSET
        }
      })]
    ]),
    writes: {
      [DEFINITION_TARGET]: context => host === undefined ? null : define({
        host,
        context
      }),
      [LINKED_TARGET]: context => host === undefined ? null : host.link({
        control: context.control,
        animations: readLinked(context.value)
      })
    }
  }] satisfies PropertyGroup[];
}
