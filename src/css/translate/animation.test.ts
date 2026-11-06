import { tracksOf } from "./animation-tracks.ts";
import type { Track } from "./animation-tracks.ts";
import { storyboardXaml, timeSpan } from "./animation-xaml.ts";
import type { AnimationSpec } from "./animation-xaml.ts";
import { loadWinuiCatalogue } from "./catalogue.ts";
import { isLinear, mirrorEasing, parseEasing, stepLevels } from "./easing.ts";
import { formatDiagnostic, translateStyleSheet } from "./translate.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

const resources = loadWinuiCatalogue();

function translate(css: string) {
  const translation = translateStyleSheet({
    file: "a.svelte",
    css,
    resources
  });
  return {
    sheet: translation.sheet,
    errors: translation.diagnostics.filter(diagnostic => diagnostic.severity === "error").map(formatDiagnostic)
  };
}

function tracksFor(css: string) {
  const { sheet, errors } = translate(css);
  assert.deepEqual(errors, []);
  const [keyframes] = sheet.keyframes;
  assert.ok(keyframes);
  const tracks = tracksOf({
    keyframes,
    report() {}
  });
  assert.ok(tracks);
  return tracks;
}

const opacityTrack: Track = {
  target: "Opacity",
  kind: "double",
  brush: null,
  isTransform: false,
  frames: [
    {
      offset: 0,
      value: 0,
      easing: null
    },
    {
      offset: 1,
      value: 1,
      easing: null
    }
  ]
};

function spec(overrides: Partial<AnimationSpec>) {
  return {
    name: "fade",
    durationMs: 1000,
    delayMs: 0,
    easing: "linear",
    iterations: 1,
    direction: "normal",
    fill: "none",
    isPaused: false,
    tracks: [opacityTrack],
    ...overrides
  } satisfies AnimationSpec;
}

test("@keyframes becomes data: offsets in order, a list sharing its declarations", () => {
  const { sheet, errors } = translate("@keyframes pulse { 50%, 0% { opacity: 0.5 } to { opacity: 1 } from { opacity: 0 } }");
  assert.deepEqual(errors, []);
  assert.deepEqual(sheet.keyframes.map(({ name, steps }) => [name, steps.map(step => step.offset)]), [["pulse", [0, 0, 0.5, 1]]]);
});

test("@keyframes with a selector that is no offset fails the build at its position", () => {
  const { errors } = translate("@keyframes x {\n  soon { opacity: 0 }\n}");
  assert.deepEqual(errors, ["a.svelte:2:3: @keyframes holds from, to and percentage keyframes only: write from, to or a percentage (50%): a percentage here is a share of the animation, not a length"]);
});

test("a keyframe property WinUI cannot animate fails the build and says what it can", () => {
  const { errors } = translate("@keyframes x { to { padding: 4px } }");
  assert.match(errors.join(), /@keyframes x: padding cannot be animated \(WinUI animates opacity, width, height, colors, translate, scale, rotate, transform, display and any keyword property\)/u);
});

test("a keyframe color must be written out", () => {
  const { errors } = translate("@keyframes x { to { background-color: var(--accent) } }");
  assert.match(errors.join(), /background-color: a keyframe color must be written out/u);
});

test("keyframe properties become tracks on the properties WinUI animates", () => {
  const tracks = tracksFor("@keyframes x { from { opacity: 0; transform: translate(0, 0) rotate(0deg) } to { opacity: 1; transform: translate(10px, 20px) rotate(90deg) scale(2); background-color: #f00 } }");
  assert.deepEqual(tracks.map(track => track.target), [
    "Opacity",
    "(UIElement.RenderTransform).(CompositeTransform.TranslateX)",
    "(UIElement.RenderTransform).(CompositeTransform.TranslateY)",
    "(UIElement.RenderTransform).(CompositeTransform.Rotation)",
    "(UIElement.RenderTransform).(CompositeTransform.ScaleX)",
    "(UIElement.RenderTransform).(CompositeTransform.ScaleY)",
    "Background.(SolidColorBrush.Color)"
  ]);
  assert.deepEqual(tracks[1]?.frames.map(frame => frame.value), [0, 10]);
  assert.equal(tracks[6]?.brush, "background");
});

test("timing functions: keywords, cubic-bezier and steps, and their mirror", () => {
  const linear = parseEasing("linear");
  assert.ok(linear && isLinear(linear));
  const easeIn = {
    kind: "bezier",
    x1: 0.42,
    y1: 0,
    x2: 1,
    y2: 1
  } as const;
  assert.deepEqual(parseEasing("ease-in"), easeIn);
  assert.deepEqual(mirrorEasing(easeIn), {
    kind: "bezier",
    x1: 0,
    y1: 0,
    x2: 1 - 0.42,
    y2: 1
  });
  assert.equal(parseEasing("cubic-bezier(2, 0, 1, 1)"), null);
  assert.deepEqual(
    stepLevels({
      kind: "steps",
      count: 4,
      jump: "end"
    }), [0, 0.25, 0.5, 0.75]
  );
  assert.deepEqual(
    stepLevels({
      kind: "steps",
      count: 2,
      jump: "start"
    }), [0.5, 1]
  );
  assert.equal(parseEasing("steps(0)"), null);
});

test("a TimeSpan is h:mm:ss.fff, signed when negative", () => {
  assert.equal(timeSpan(250), "0:00:00.250");
  assert.equal(timeSpan(61_500), "0:01:01.500");
  assert.equal(timeSpan(-1000), "-0:00:01.000");
});

test("a fade becomes one key frame animation with a spline per easing", () => {
  const xaml = storyboardXaml(spec({ easing: "ease-out" }));
  assert.match(xaml, /^<Storyboard xmlns=/u);
  assert.match(xaml, /<DoubleAnimationUsingKeyFrames Storyboard\.TargetProperty="Opacity" EnableDependentAnimation="True" BeginTime="0:00:00\.000" FillBehavior="Stop">/u);
  assert.match(xaml, /<DiscreteDoubleKeyFrame KeyTime="0:00:00\.000" Value="0"\/>/u);
  assert.match(xaml, /<SplineDoubleKeyFrame KeyTime="0:00:01\.000" Value="1" KeySpline="0,0 0\.58,1"\/>/u);
});

test("fill forwards holds the end; a delay is the begin time", () => {
  const xaml = storyboardXaml(
    spec({
      fill: "forwards",
      delayMs: 200
    })
  );
  assert.match(xaml, /BeginTime="0:00:00\.200" FillBehavior="HoldEnd"/u);
});

test("a delay with fill backwards holds the first frame instead", () => {
  const xaml = storyboardXaml(
    spec({
      fill: "backwards",
      delayMs: 500
    })
  );
  assert.match(xaml, /BeginTime="0:00:00\.000"/u);
  assert.match(xaml, /<DiscreteDoubleKeyFrame KeyTime="0:00:00\.000" Value="0"\/><DiscreteDoubleKeyFrame KeyTime="0:00:00\.500" Value="0"\/>/u);
  assert.match(xaml, /KeyTime="0:00:01\.500" Value="1"/u);
});

test("infinite alternate repeats a forward and a backward run forever", () => {
  const xaml = storyboardXaml(
    spec({
      iterations: null,
      direction: "alternate"
    })
  );
  assert.match(xaml, /RepeatBehavior="Forever"/u);
  assert.match(xaml, /KeyTime="0:00:01\.000" Value="1"\/>/u);
  assert.match(xaml, /KeyTime="0:00:02\.000" Value="0"\/>/u);
});

test("reverse runs the keyframes from the last, and mirrors the easing", () => {
  const xaml = storyboardXaml(
    spec({
      direction: "reverse",
      easing: "ease-in"
    })
  );
  assert.match(xaml, /<DiscreteDoubleKeyFrame KeyTime="0:00:00\.000" Value="1"\/>/u);
  assert.match(xaml, /<SplineDoubleKeyFrame KeyTime="0:00:01\.000" Value="0" KeySpline="0,0 0\.58,1"\/>/u);
});

test("an even count of an alternating animation is WinUI's own repeat of a cycle", () => {
  const xaml = storyboardXaml(
    spec({
      iterations: 4,
      direction: "alternate"
    })
  );
  assert.match(xaml, /RepeatBehavior="2x"/u);
});

test("a count of a plain animation is WinUI's own repeat", () => {
  assert.match(storyboardXaml(spec({ iterations: 3 })), /RepeatBehavior="3x"/u);
  assert.doesNotMatch(storyboardXaml(spec({ iterations: 1 })), /RepeatBehavior/u);
});

test("an odd count of an alternating animation is written out iteration by iteration", () => {
  const xaml = storyboardXaml(
    spec({
      iterations: 3,
      direction: "alternate"
    })
  );
  assert.doesNotMatch(xaml, /RepeatBehavior/u);
  assert.match(xaml, /KeyTime="0:00:03\.000" Value="1"/u);
});

test("steps become discrete frames", () => {
  const xaml = storyboardXaml(spec({ easing: "steps(2, end)" }));
  assert.doesNotMatch(xaml, /Spline|Linear/u);
  assert.match(xaml, /KeyTime="0:00:00\.500" Value="0\.5"/u);
  assert.match(xaml, /KeyTime="0:00:01\.000" Value="1"/u);
});

test("a color track mixes channels and animates a Color", () => {
  const xaml = storyboardXaml(
    spec({
      easing: "steps(2, end)",
      tracks: [{
        target: "Background.(SolidColorBrush.Color)",
        kind: "color",
        brush: "background",
        isTransform: false,
        frames: [
          {
            offset: 0,
            value: "#FF000000",
            easing: null
          },
          {
            offset: 1,
            value: "#FFFFFFFF",
            easing: null
          }
        ]
      }]
    })
  );
  assert.match(xaml, /<ColorAnimationUsingKeyFrames Storyboard\.TargetProperty="Background\.\(SolidColorBrush\.Color\)" BeginTime/u);
  assert.match(xaml, /<DiscreteColorKeyFrame KeyTime="0:00:00\.500" Value="#FF808080"\/>/u);
});

function longhands(css: string) {
  const { sheet, errors } = translate(css);
  assert.deepEqual(errors, []);
  return Object.fromEntries((sheet.rules[0]?.declarations ?? []).map(({ property, value }) => [property, value]));
}

test("the animation shorthand sets all eight longhands, those it omits to their initial value", () => {
  assert.deepEqual(longhands(".a { animation: fade 2s ease-in 100ms infinite alternate forwards paused }"), {
    "animation-name": "fade",
    "animation-duration": "2s",
    "animation-timing-function": "ease-in",
    "animation-delay": "100ms",
    "animation-iteration-count": "infinite",
    "animation-direction": "alternate",
    "animation-fill-mode": "forwards",
    "animation-play-state": "paused"
  });
  assert.deepEqual(longhands(".a { animation: spin 1s }"), {
    "animation-name": "spin",
    "animation-duration": "1s",
    "animation-timing-function": "ease",
    "animation-delay": "0s",
    "animation-iteration-count": "1",
    "animation-direction": "normal",
    "animation-fill-mode": "none",
    "animation-play-state": "running"
  });
});

test("a list of animations expands to a list in each longhand", () => {
  const values = longhands(".a { animation: a 1s linear, b 2s 1s }");
  assert.equal(values["animation-name"], "a, b");
  assert.equal(values["animation-duration"], "1s, 2s");
  assert.equal(values["animation-delay"], "0s, 1s");
});

test("an animation property that is not a value fails the build", () => {
  const { errors } = translate(".a { animation-name: x; animation-direction: sideways; animation-iteration-count: 1.5 }");
  assert.match(errors.join("\n"), /animation-direction: expected one of normal, reverse, alternate, alternate-reverse, found "sideways"/u);
  assert.match(errors.join("\n"), /animation-iteration-count: expected infinite or a whole number/u);
});

test("display in @keyframes steps Visibility: a hide lands at the end of the fade, a show at its start", () => {
  const [hide] = tracksFor("@keyframes out { from { opacity: 1; display: block } to { opacity: 0; display: none } }").filter(track => track.kind === "discrete");
  assert.deepEqual(hide?.frames.map(frame => [frame.offset, frame.value]), [[0, "Visible"], [1, "Collapsed"]]);
  const [show] = tracksFor("@keyframes in { from { display: none } to { display: block } }").filter(track => track.kind === "discrete");
  assert.deepEqual(show?.frames.map(frame => [frame.offset, frame.value]), [[0, "Visible"], [1, "Visible"]]);
});

test("a Visibility track is written as discrete object key frames, whatever the easing", () => {
  const tracks = tracksFor("@keyframes out { from { display: block } to { display: none } }");
  const xaml = storyboardXaml(
    spec({
      easing: "ease-in",
      tracks
    })
  );
  assert.match(xaml, /<ObjectAnimationUsingKeyFrames Storyboard\.TargetProperty="Visibility" BeginTime="0:00:00\.000" FillBehavior="Stop">/u);
  assert.match(xaml, /<DiscreteObjectKeyFrame KeyTime="0:00:00\.000" Value="Visible"\/>/u);
  assert.match(xaml, /<DiscreteObjectKeyFrame KeyTime="0:00:01\.000" Value="Collapsed"\/>/u);
});

test("display in @keyframes fails the build on a word it does not know", () => {
  const { errors } = translate("@keyframes x { to { display: sideways } }");
  assert.match(errors.join(), /@keyframes x: display: expected one of none, block, inline, inline-block, flex, inline-flex, grid, inline-grid, contents, found "sideways"/u);
});

test("a keyword property in @keyframes flips at the middle of the interval", () => {
  const [flip] = tracksFor("@keyframes x { from { font-style: normal } to { font-style: italic } }");
  assert.equal(flip?.kind, "discrete");
  assert.equal(flip?.target, "FontStyle");
  assert.deepEqual(flip?.frames.map(frame => [frame.offset, frame.value]), [[0, "Normal"], [0.5, "Italic"], [1, "Italic"]]);
});

test("properties that set one WinUI property share its track", () => {
  const tracks = tracksFor("@keyframes x { from { white-space: normal } to { text-wrap: nowrap } }");
  assert.deepEqual(tracks.map(track => track.target), ["TextWrapping"]);
});

test("a keyword track is written as discrete object key frames", () => {
  const xaml = storyboardXaml(
    spec({
      easing: "ease-in",
      tracks: tracksFor("@keyframes x { from { font-style: normal } to { font-style: italic } }")
    })
  );
  assert.match(xaml, /<ObjectAnimationUsingKeyFrames Storyboard\.TargetProperty="FontStyle"/u);
  assert.match(xaml, /<DiscreteObjectKeyFrame KeyTime="0:00:00\.000" Value="Normal"\/>/u);
  assert.match(xaml, /<DiscreteObjectKeyFrame KeyTime="0:00:00\.500" Value="Italic"\/>/u);
});

test("a keyword property in @keyframes fails the build on a word it does not know", () => {
  const { errors } = translate("@keyframes x { to { text-align: sideways } }");
  assert.match(errors.join(), /@keyframes x: text-align: expected one of left, start, center, right, end, justify, found "sideways"/u);
});

const FADE_FRAMES = "@keyframes fade { from { opacity: 0 } to { opacity: 1 } }";

test("an animation on scroll() builds, and the animation shorthand reads the timeline", () => {
  const { errors } = translate(`${FADE_FRAMES}\n.a { animation: fade linear both scroll(root block); animation-range: 10% 90% }`);
  assert.deepEqual(errors, []);
  const values = longhands(".a { animation: fade linear view(inline 10px) --hero }");
  assert.equal(values["animation-timeline"], "--hero");
});

test("animation-range sets its start and end, a lone name is that whole part", () => {
  const values = longhands(".a { animation-range: entry 10% exit 90% }");
  assert.deepEqual([values["animation-range-start"], values["animation-range-end"]], ["entry 10%", "exit 90%"]);
  const whole = longhands(".a { animation-range: cover }");
  assert.deepEqual([whole["animation-range-start"], whole["animation-range-end"]], ["cover", "cover"]);
});

test("scroll-timeline and view-timeline expand to their longhands", () => {
  const scroll = longhands(".a { scroll-timeline: --page inline }");
  assert.deepEqual([scroll["scroll-timeline-name"], scroll["scroll-timeline-axis"]], ["--page", "inline"]);
  const view = longhands(".a { view-timeline: --card x 10px 20px }");
  assert.deepEqual([view["view-timeline-name"], view["view-timeline-axis"], view["view-timeline-inset"]], ["--card", "x", "10px 20px"]);
});

test("an animation-timeline that is no timeline fails the build with what it can be", () => {
  const { errors } = translate(`${FADE_FRAMES}\n.a { animation-name: fade; animation-timing-function: linear; animation-timeline: sideways }`);
  assert.deepEqual(errors, ["a.svelte:2:63: animation-timeline: expected auto, none, scroll(), view() or a dashed name such as --hero, found \"sideways\""]);
});

test("a scroll-linked animation says what Composition cannot drive", () => {
  const { errors } = translate("@keyframes grow { from { width: 10px } to { width: 99px } }\n.a { animation: grow linear scroll() }");
  assert.match(errors.join("\n"), /animation-timeline: @keyframes grow animates Width, which Composition cannot drive from a scroll position \(it drives opacity, translate, scale and rotate/u);
});

test("a scroll-linked animation asks for linear easing, one iteration and a plain direction", () => {
  const eased = translate(`${FADE_FRAMES}\n.a { animation: fade ease scroll() }`).errors.join("\n");
  assert.match(eased, /animation-timing-function: a scroll-linked animation maps the scroll position straight onto its key frames; write linear \(found "ease"\)/u);
  const repeated = translate(`${FADE_FRAMES}\n.a { animation: fade linear 3 scroll() }`).errors.join("\n");
  assert.match(repeated, /animation-iteration-count: a scroll-linked animation runs once across its range; write 1/u);
  const alternating = translate(`${FADE_FRAMES}\n.a { animation: fade linear alternate scroll() }`).errors.join("\n");
  assert.match(alternating, /animation-direction: a scroll-linked animation runs forwards or in reverse/u);
});

test("a range name belongs to a view timeline", () => {
  const { errors } = translate(`${FADE_FRAMES}\n.a { animation: fade linear scroll(); animation-range: entry }`);
  assert.match(errors.join("\n"), /animation-range: a range name \(cover, entry, exit\.\.\.\) belongs to a view timeline/u);
  assert.deepEqual(translate(`${FADE_FRAMES}\n.a { animation: fade linear view(); animation-range: entry exit }`).errors, []);
});

test("an animation-range that is not a range fails the build", () => {
  const { errors } = translate(`${FADE_FRAMES}\n.a { animation: fade linear view(); animation-range: middle 10% }`);
  assert.match(errors.join("\n"), /animation-range-start: expected normal, a range name/u);
});
