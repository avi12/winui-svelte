import { TrackKind, visibilityOf } from "./animation-tracks.ts";
import { AnimationDirection, AnimationFill, storyboardXaml } from "./animation-xaml.ts";
import { parseEasing } from "./easing.ts";
import type { GroupInput, Output, PropertyGroup, WriteContext } from "./property-kit.ts";
import { parseColor } from "#src/css/parse/colors.js";
import type { Reader } from "#src/css/parse/reader.js";
import { parseMilliseconds, splitCommas, splitWords } from "#src/css/parse/values.js";

const BORDER_COLOR = "border-color";
const BORDER_COLOR_TARGET = "border-color-transition";
const VISIBILITY_TARGET = "visibility-transition";
const ALLOW_DISCRETE = "allow-discrete";
const VISIBLE = "Visible";
const COLLAPSED = "Collapsed";
const DISCRETE_PROPERTIES = ["display", "visibility"];
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

// The color a border brush last had (the one a change is animated from).
const borderColors = new WeakMap<object, string>();

// What each write's text stands for (the write's value is a string), as the animation group does.
const resolved = new Map<string, BorderColorTransition>();

interface BorderColorTransition {
  color: string;
  durationMs: number;
  delayMs: number;
  easing: string;
}

// `border-color 200ms ease-out 50ms`: a timing function and a delay may follow the duration.
function borderColorWrite({ input, durationMs, rest }: {
  input: GroupInput;
  durationMs: number;
  rest: readonly string[];
}) {
  const reader = input.reading("transition");
  const color = parseColor((input.computed.get(BORDER_COLOR)?.value ?? "").trim());
  const isColorMissing = color === null;
  if (isColorMissing) {
    reader.warn("transition: border-color is animated between colors written out (hex, rgb(), a name) in the border-color of the rules that apply; ignored");
    return [];
  }

  const easing = rest.find(word => parseEasing(word) !== null) ?? DEFAULT_EASING;
  const delays = rest.map(parseMilliseconds).filter(delay => delay !== null);
  const unread = rest.filter(word => parseEasing(word) === null && parseMilliseconds(word) === null);
  const hasUnread = unread.length > 0;
  if (hasUnread) {
    reader.warn(`transition: "${unread.join(" ")}" ignored (a border-color transition takes a duration, a timing function and a delay)`);
  }

  const transition = {
    color,
    durationMs,
    delayMs: delays[0] ?? 0,
    easing
  } satisfies BorderColorTransition;
  const value = JSON.stringify(transition);
  resolved.set(value, transition);
  return [{
    kind: "write",
    target: BORDER_COLOR_TARGET,
    value
  } as const];
}

// When the border color changes, its brush runs from the old color to the new one on a Storyboard.
function animateBorderColor({ control, value, native }: WriteContext) {
  const transition = resolved.get(value);
  const isUnknown = transition === undefined;
  if (isUnknown) {
    return null;
  }

  const { color, durationMs, delayMs, easing } = transition;
  const from = borderColors.get(control);
  borderColors.set(control, color);
  const isUnchanged = from === undefined || from === color;
  if (isUnchanged) {
    return null;
  }

  const xaml = storyboardXaml({
    name: BORDER_COLOR_TARGET,
    durationMs,
    delayMs,
    easing,
    iterations: 1,
    direction: AnimationDirection.NORMAL,
    fill: AnimationFill.FORWARDS,
    isPaused: false,
    tracks: [{
      target: "BorderBrush.(SolidColorBrush.Color)",
      kind: TrackKind.COLOR,
      brush: "borderBrush",
      isTransform: false,
      frames: [
        {
          offset: 0,
          value: from,
          easing: null
        },
        {
          offset: 1,
          value: color,
          easing: null
        }
      ]
    }]
  });
  return native.animate({
    control,
    storyboards: [{
      xaml,
      isPaused: false
    }],
    hasTransform: false,
    brushes: [{
      property: "borderBrush",
      color: from
    }]
  });
}

interface VisibilityTransition {
  to: string;
  durationMs: number;
  delayMs: number;
}

// The Visibility each element last had (the one a change is held at until the transition ends).
const visibilities = new WeakMap<object, string>();
const visibilityResolved = new Map<string, VisibilityTransition>();

// `display 200ms allow-discrete`: a hide waits for the duration (and delay), a show is at once.
function visibilityWrite({ input, durationMs, rest }: {
  input: GroupInput;
  durationMs: number;
  rest: readonly string[];
}) {
  const reader = input.reading("transition");
  const written = DISCRETE_PROPERTIES.map(property => ({
    property,
    word: input.computed.get(property)?.value
  })).findLast(entry => entry.word !== undefined);
  const to = written === undefined ? VISIBLE : visibilityOf({
    property: written.property,
    word: written.word ?? ""
  }) ?? VISIBLE;
  const delays = rest.map(parseMilliseconds).filter(delay => delay !== null);
  const unread = rest.filter(word => {
    const isRead = word === ALLOW_DISCRETE || parseEasing(word) !== null || parseMilliseconds(word) !== null;
    return !isRead;
  });
  const hasUnread = unread.length > 0;
  if (hasUnread) {
    reader.warn(`transition: "${unread.join(" ")}" ignored (a display transition takes a duration, allow-discrete and a delay)`);
  }

  const transition = {
    to,
    durationMs,
    delayMs: delays[0] ?? 0
  } satisfies VisibilityTransition;
  const value = JSON.stringify(transition);
  visibilityResolved.set(value, transition);
  return [{
    kind: "write",
    target: VISIBILITY_TARGET,
    value
  } as const];
}

// When an element goes from visible to collapsed, a Storyboard keeps it visible for the duration, then collapses it.
function animateVisibility({ control, value, native }: WriteContext) {
  const transition = visibilityResolved.get(value);
  const isUnknown = transition === undefined;
  if (isUnknown) {
    return null;
  }

  const { to, durationMs, delayMs } = transition;
  const from = visibilities.get(control);
  visibilities.set(control, to);
  const isHide = from === VISIBLE && to === COLLAPSED;
  if (!isHide) {
    return null;
  }

  const xaml = storyboardXaml({
    name: VISIBILITY_TARGET,
    durationMs,
    delayMs,
    easing: DEFAULT_EASING,
    iterations: 1,
    direction: AnimationDirection.NORMAL,
    fill: AnimationFill.FORWARDS,
    isPaused: false,
    tracks: [{
      target: "Visibility",
      kind: TrackKind.VISIBILITY,
      brush: null,
      isTransform: false,
      frames: [
        {
          offset: 0,
          value: VISIBLE,
          easing: null
        },
        {
          offset: 1,
          value: COLLAPSED,
          easing: null
        }
      ]
    }]
  });
  return native.animate({
    control,
    storyboards: [{
      xaml,
      isPaused: false
    }],
    hasTransform: false,
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
  const isBorderColor = name === BORDER_COLOR && milliseconds !== null;
  if (isBorderColor) {
    outputs.push(
      ...borderColorWrite({
        input,
        durationMs: milliseconds,
        rest
      })
    );
    return outputs;
  }

  const isDiscrete = DISCRETE_PROPERTIES.includes(name) && milliseconds !== null;
  if (isDiscrete) {
    const isAllowed = rest.includes(ALLOW_DISCRETE);
    if (isAllowed) {
      outputs.push(
        ...visibilityWrite({
          input,
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
    reader.warn(`transition: ${property} cannot be animated (WinUI animates opacity, translate, scale, rotate, background, border-color, a shadow's depth, and display or visibility with allow-discrete); ignored`);
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

/** The group of `transition`: WinUI's implicit transitions, and a border color's Storyboard. */
export function transitionProperty() {
  return {
    members: ["transition"],
    lower: transition,
    writes: {
      [BORDER_COLOR_TARGET]: animateBorderColor,
      [VISIBILITY_TARGET]: animateVisibility
    }
  } satisfies PropertyGroup;
}
