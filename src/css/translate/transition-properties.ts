import { type Track, TrackKind } from "./animation-tracks.ts";
import { AnimationDirection, AnimationFill, storyboardXaml } from "./animation-xaml.ts";
import {
  COLLAPSED,
  DISCRETE_MEMBERS,
  DISCRETE_WINUI_PROPERTIES,
  discretePropertyOf,
  discreteValueOf,
  VISIBILITY_PROPERTY,
  VISIBLE
} from "./discrete-properties.ts";
import { parseEasing } from "./easing.ts";
import type { GroupInput, Output, PropertyGroup, WriteContext } from "./property-kit.ts";
import { parseColor } from "#src/css/parse/colors.js";
import type { Reader } from "#src/css/parse/reader.js";
import { parseLength, parseMilliseconds, splitCommas, splitWords } from "#src/css/parse/values.js";

const ALLOW_DISCRETE = "allow-discrete";
const MIDPOINT = 0.5;
const DEFAULT_EASING = "ease";
const MILLISECONDS_PER_SECOND = 1000;
const DURATION_FRACTION_DIGITS = 3;

/** WinUI animates these properties by an implicit transition set on them. */
const TRANSITION_TARGETS = new Map<string, Array<[string, string]>>([
  ["opacity", [["OpacityTransition", "ScalarTransition"]]],
  ["translate", [["TranslationTransition", "Vector3Transition"]]],
  ["scale", [["ScaleTransition", "Vector3Transition"]]],
  ["rotate", [["RotationTransition", "ScalarTransition"]]],
  ["background", [["BackgroundTransition", "BrushTransition"]]],
  ["background-color", [["BackgroundTransition", "BrushTransition"]]],
  // The Z of Translation is a ThemeShadow's depth: the shadow's elevation animates with it.
  ["box-shadow", [["TranslationTransition", "Vector3Transition"]]],
  ["-winui-elevation", [["TranslationTransition", "Vector3Transition"]]],
  // A transform list of translate, rotate and scale is lowered to the properties
  // of those names (transform-properties.ts), which these animate.
  ["transform", [
    ["TranslationTransition", "Vector3Transition"],
    ["ScaleTransition", "Vector3Transition"],
    ["RotationTransition", "ScalarTransition"]
  ]],
  ["all", [
    ["OpacityTransition", "ScalarTransition"],
    ["TranslationTransition", "Vector3Transition"],
    ["ScaleTransition", "Vector3Transition"],
    ["RotationTransition", "ScalarTransition"]
  ]]
]);

function duration(milliseconds: number) {
  const seconds = (milliseconds / MILLISECONDS_PER_SECOND).toFixed(DURATION_FRACTION_DIGITS);
  return `0:0:${seconds}`;
}

interface StoryboardProperty {
  kind: TrackKind;
  target: string;
  brush: string | null;
}

// What a Storyboard animates because WinUI has no implicit transition for it: a Double, or the Color of a brush.
const STORYBOARD_PROPERTIES = new Map<string, StoryboardProperty>([
  ["border-color", {
    kind: TrackKind.COLOR,
    target: "BorderBrush.(SolidColorBrush.Color)",
    brush: "borderBrush"
  }],
  ["color", {
    kind: TrackKind.COLOR,
    target: "Foreground.(SolidColorBrush.Color)",
    brush: "foreground"
  }],
  ...[
    ["width", "Width"],
    ["height", "Height"],
    ["min-width", "MinWidth"],
    ["min-height", "MinHeight"],
    ["max-width", "MaxWidth"],
    ["max-height", "MaxHeight"],
    ["font-size", "FontSize"]
  ].map(([member = "", target = ""]) => [member, {
    kind: TrackKind.DOUBLE,
    target,
    brush: null
  }] as const)
]);

interface StoryboardTransition {
  value: number | string;
  durationMs: number;
  delayMs: number;
  easing: string;
}

interface DiscreteTransition {
  to: string;
  durationMs: number;
  delayMs: number;
}

// The value each element last had for a target (the one a change is animated from).
const lastValues = new WeakMap<object, Map<string, number | string>>();

// What each write's text stands for (the write's value is a string), as the animation group does.
const resolved = new Map<string, StoryboardTransition>();
const discreteResolved = new Map<string, DiscreteTransition>();

function targetOf(member: string) {
  return `${member}-transition`;
}

function discreteTargetOf(property: string) {
  return targetOf(property.toLowerCase());
}

function swapLastValue({ control, key, value }: {
  control: object;
  key: string;
  value: number | string;
}) {
  const lasts = lastValues.get(control) ?? new Map<string, number | string>();
  lastValues.set(control, lasts);
  const previous = lasts.get(key);
  lasts.set(key, value);
  return previous;
}

function writeOf<T>({ registry, target, transition }: {
  registry: Map<string, T>;
  target: string;
  transition: T;
}) {
  const value = JSON.stringify(transition);
  registry.set(value, transition);
  return [{
    kind: "write",
    target,
    value
  } as const];
}

// The easing and delay that follow a duration; a word that is neither (or one of `accepted`) is warned about.
function timingTail({ reader, rest, accepted, takes }: {
  reader: Reader;
  rest: readonly string[];
  accepted: readonly string[];
  takes: string;
}) {
  const delays = rest.map(parseMilliseconds).filter(delay => delay !== null);
  const unread = rest.filter(word => {
    const isRead = accepted.includes(word) || parseEasing(word) !== null || parseMilliseconds(word) !== null;
    return !isRead;
  });
  const hasUnread = unread.length > 0;
  if (hasUnread) {
    reader.warn(`transition: "${unread.join(" ")}" ignored (${takes})`);
  }

  return {
    easing: rest.find(word => parseEasing(word) !== null) ?? DEFAULT_EASING,
    delayMs: delays[0] ?? 0
  };
}

function runTrack({ context, name, timing, track, brushes }: {
  context: WriteContext;
  name: string;
  timing: {
    durationMs: number;
    delayMs: number;
    easing: string;
  };
  track: Track;
  brushes: Array<{
    property: string;
    color: string;
  }>;
}) {
  const { control, native } = context;
  const xaml = storyboardXaml({
    name,
    ...timing,
    iterations: 1,
    direction: AnimationDirection.NORMAL,
    fill: AnimationFill.FORWARDS,
    isPaused: false,
    tracks: [track]
  });
  return native.animate({
    control,
    storyboards: [{
      xaml,
      isPaused: false
    }],
    hasTransform: false,
    brushes
  });
}

function fromToTrack({ target, kind, brush, from, to }: {
  target: string;
  kind: TrackKind;
  brush: string | null;
  from: number | string;
  to: number | string;
}) {
  return {
    target,
    kind,
    brush,
    isTransform: false,
    frames: [
      {
        offset: 0,
        value: from,
        easing: null
      },
      {
        offset: 1,
        value: to,
        easing: null
      }
    ]
  } satisfies Track;
}

// The value a rule set for the property: a color written out, or a length in px.
function writtenValue({ input, member, kind }: {
  input: GroupInput;
  member: string;
  kind: TrackKind;
}) {
  const text = (input.computed.get(member)?.value ?? "").trim();
  return kind === TrackKind.COLOR ? parseColor(text) : parseLength(text);
}

// `border-color 1s ease-out 50ms`: a timing function and a delay may follow the duration.
function storyboardWrite({ input, member, durationMs, rest }: {
  input: GroupInput;
  member: string;
  durationMs: number;
  rest: readonly string[];
}) {
  const reader = input.reading("transition");
  const spec = STORYBOARD_PROPERTIES.get(member);
  const value = spec === undefined ? null : writtenValue({
    input,
    member,
    kind: spec.kind
  });
  const isValueMissing = value === null;
  if (isValueMissing) {
    const written = spec?.kind === TrackKind.COLOR ? "colors written out (hex, rgb(), a name)" : "lengths written in px";
    reader.warn(`transition: ${member} is animated between ${written} in the ${member} of the rules that apply; ignored`);
    return [];
  }

  const { easing, delayMs } = timingTail({
    reader,
    rest,
    accepted: [],
    takes: `a ${member} transition takes a duration, a timing function and a delay`
  });
  return writeOf({
    registry: resolved,
    target: targetOf(member),
    transition: {
      value,
      durationMs,
      delayMs,
      easing
    }
  });
}

// When the property changes, a Storyboard runs it from the old value to the new one.
function animateStoryboard({ context, member }: {
  context: WriteContext;
  member: string;
}) {
  const transition = resolved.get(context.value);
  const spec = STORYBOARD_PROPERTIES.get(member);
  const isUnknown = transition === undefined || spec === undefined;
  if (isUnknown) {
    return null;
  }

  const { value: to, durationMs, delayMs, easing } = transition;
  const from = swapLastValue({
    control: context.control,
    key: member,
    value: to
  });
  const isUnchanged = from === undefined || from === to;
  if (isUnchanged) {
    return null;
  }

  const brush = spec.kind === TrackKind.COLOR ? spec.brush : null;
  return runTrack({
    context,
    name: targetOf(member),
    timing: {
      durationMs,
      delayMs,
      easing
    },
    track: fromToTrack({
      target: spec.target,
      kind: spec.kind,
      brush: spec.brush,
      from,
      to
    }),
    brushes: brush === null ? [] : [{
      property: brush,
      color: String(from)
    }]
  });
}

// The value a rule gave the WinUI property of a discrete member: the last of the members that set it.
function writtenWinuiValue({ input, property }: {
  input: GroupInput;
  property: string;
}) {
  const written = DISCRETE_MEMBERS.filter(member => discretePropertyOf(member) === property).map(member => ({
    member,
    word: input.computed.get(member)?.value
  })).findLast(entry => entry.word !== undefined);
  const fallback = property === VISIBILITY_PROPERTY ? VISIBLE : undefined;
  return written === undefined ? fallback : discreteValueOf({
    member: written.member,
    word: written.word ?? ""
  }) ?? fallback;
}

// `display 200ms allow-discrete`: a hide waits for the duration (and delay), a show is at once; any other keyword
// property takes its new value at the middle of the duration.
function discreteWrite({ input, member, durationMs, rest }: {
  input: GroupInput;
  member: string;
  durationMs: number;
  rest: readonly string[];
}) {
  const property = discretePropertyOf(member) ?? "";
  const to = writtenWinuiValue({
    input,
    property
  });
  const isValueMissing = to === undefined;
  if (isValueMissing) {
    return [];
  }

  const { delayMs } = timingTail({
    reader: input.reading("transition"),
    rest,
    accepted: [ALLOW_DISCRETE],
    takes: `a ${member} transition takes a duration, allow-discrete and a delay`
  });
  return writeOf({
    registry: discreteResolved,
    target: discreteTargetOf(property),
    transition: {
      to,
      durationMs,
      delayMs
    }
  });
}

// The old value for the first half of the duration, the new one after it, held to the end.
function flipTrack({ property, from, to }: {
  property: string;
  from: string;
  to: string;
}) {
  const track = fromToTrack({
    target: property,
    kind: TrackKind.DISCRETE,
    brush: null,
    from,
    to
  });
  track.frames.splice(1, 0, {
    offset: MIDPOINT,
    value: to,
    easing: null
  });
  return track;
}

// When an element goes from visible to collapsed, a Storyboard keeps it visible for the duration, then collapses it;
// any other keyword property flips to its new value at the middle of the duration.
function animateDiscrete({ context, property }: {
  context: WriteContext;
  property: string;
}) {
  const transition = discreteResolved.get(context.value);
  const isUnknown = transition === undefined;
  if (isUnknown) {
    return null;
  }

  const { to, durationMs, delayMs } = transition;
  const name = discreteTargetOf(property);
  const from = swapLastValue({
    control: context.control,
    key: name,
    value: to
  });
  const isUnchanged = from === undefined || from === to;
  if (isUnchanged) {
    return null;
  }

  const isVisibility = property === VISIBILITY_PROPERTY;
  const isHide = from === VISIBLE && to === COLLAPSED;
  const isShow = isVisibility && !isHide;
  if (isShow) {
    return null;
  }

  const track = isVisibility ? fromToTrack({
    target: property,
    kind: TrackKind.DISCRETE,
    brush: null,
    from: VISIBLE,
    to: COLLAPSED
  }) : flipTrack({
    property,
    from: String(from),
    to
  });
  return runTrack({
    context,
    name,
    timing: {
      durationMs,
      delayMs,
      easing: DEFAULT_EASING
    },
    track,
    brushes: []
  });
}

// One entry of a `transition` list (`property duration ...`) as its writes.
function entryOutputs({ input, reader, entry }: {
  input: GroupInput;
  reader: Reader;
  entry: string;
}) {
  const outputs: Output[] = [];
  const [property = "", time, ...rest] = splitWords(entry);
  const name = property.toLowerCase();
  const milliseconds = time === undefined ? null : parseMilliseconds(time);
  const isStoryboard = STORYBOARD_PROPERTIES.has(name) && milliseconds !== null;
  if (isStoryboard) {
    outputs.push(
      ...storyboardWrite({
        input,
        member: name,
        durationMs: milliseconds,
        rest
      })
    );
    return outputs;
  }

  const isDiscrete = DISCRETE_MEMBERS.includes(name) && milliseconds !== null;
  if (isDiscrete) {
    const isAllowed = rest.includes(ALLOW_DISCRETE);
    if (isAllowed) {
      outputs.push(
        ...discreteWrite({
          input,
          member: name,
          durationMs: milliseconds,
          rest
        })
      );
    } else {
      reader.warn(`transition: ${property} steps instead of blending: add allow-discrete to hold the old value for the duration; ignored`);
    }

    return outputs;
  }

  const targets = TRANSITION_TARGETS.get(name);
  const isTargetsMissing = targets === undefined;
  if (isTargetsMissing) {
    reader.warn(`transition: ${property} cannot be animated (WinUI animates opacity, translate, scale, rotate, background, color, border-color, width, height, font-size, a shadow's depth, and display or any keyword property with allow-discrete); ignored`);
    return outputs;
  }

  const isMillisecondsMissing = milliseconds === null;
  if (isMillisecondsMissing) {
    reader.expectedToken({
      what: "`property duration`",
      token: entry
    });
    return outputs;
  }

  const hasRestItems = rest.length > 0;
  if (hasRestItems) {
    reader.warn(`transition: "${rest.join(" ")}" ignored (WinUI's implicit transitions take a duration only)`);
  }

  for (const [target, type] of targets) {
    outputs.push({
      kind: "content",
      property: target,
      xaml: `<${type} Duration="${duration(milliseconds)}"/>`
    });
  }

  return outputs;
}

/** `transition`: WinUI's implicit transition for each animatable property named, and a border color's Storyboard. */
function transition(input: GroupInput) {
  const reader = input.reading("transition");
  return splitCommas(reader.declaration.value)
    .filter(entry => (splitWords(entry)[0] ?? "").toLowerCase() !== "none")
    .flatMap(entry => entryOutputs({
      input,
      reader,
      entry
    }));
}

const storyboardHandlers = Object.fromEntries(
  [...STORYBOARD_PROPERTIES.keys()].map(member => [
    targetOf(member),
    (context: WriteContext) => animateStoryboard({
      context,
      member
    })
  ])
);

const discreteHandlers = Object.fromEntries(
  DISCRETE_WINUI_PROPERTIES.map(property => [
    discreteTargetOf(property),
    (context: WriteContext) => animateDiscrete({
      context,
      property
    })
  ])
);

/** The group of `transition`: WinUI's implicit transitions, and the Storyboards of the rest. */
export function transitionProperty() {
  return {
    members: ["transition"],
    lower: transition,
    writes: {
      ...storyboardHandlers,
      ...discreteHandlers
    }
  } satisfies PropertyGroup;
}
