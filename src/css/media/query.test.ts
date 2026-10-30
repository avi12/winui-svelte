import { fakeInputs } from "./fake-inputs.ts";
import type { MediaInputs } from "./features.ts";
import { ColorGamut, MEDIA_FEATURES, MediaPresentation } from "./features.ts";
import { changesOf, mediaListMatches, normalizedMedia, parseMediaList } from "./query.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

// One evaluator for @media and matchMedia: grammar, units, and one test per
// feature of the table, over a fake of the inputs.

function matches({ query, inputs = fakeInputs() }: {
  query: string;
  inputs?: MediaInputs;
}) {
  return mediaListMatches({
    parsed: parseMediaList(query),
    inputs
  });
}

test("types, not, only and comma lists", () => {
  assert.equal(matches({ query: "screen" }), true);
  assert.equal(matches({ query: "all" }), true);
  assert.equal(matches({ query: "print" }), false);
  assert.equal(matches({ query: "not print" }), true);
  assert.equal(matches({ query: "only screen and (min-width: 600px)" }), true);
  assert.equal(matches({ query: "print, (min-width: 600px)" }), true);
  assert.equal(matches({ query: "print and (min-width: 600px)" }), false);
  assert.equal(matches({ query: "(((" }), false, "a query that does not parse never matches");
});

test("and, or, not and nesting of conditions", () => {
  assert.equal(matches({ query: "(min-width: 600px) and (max-width: 900px)" }), true);
  assert.equal(matches({ query: "(min-width: 900px) or (max-height: 700px)" }), true);
  assert.equal(matches({ query: "not (min-width: 900px)" }), true);
  assert.equal(matches({ query: "((min-width: 600px) or (min-width: 5000px)) and (orientation: landscape)" }), true);
  assert.equal(matches({ query: "(min-width: 600px) and (max-width: 700px) or (width: 1px)" }), false, "mixing and with or needs parentheses");
});

test("range syntax, legacy prefixes and units", () => {
  assert.equal(matches({ query: "(width >= 800px)" }), true);
  assert.equal(matches({ query: "(width > 800px)" }), false);
  assert.equal(matches({ query: "(400px <= width <= 900px)" }), true);
  assert.equal(matches({ query: "(900px < width)" }), false);
  assert.equal(matches({ query: "(min-width: 50em)" }), true, "50em is 800px");
  assert.equal(matches({ query: "(max-width: 49.9rem)" }), false);
  assert.equal(matches({ query: "(min-resolution: 144dpi)" }), true, "1.5 dppx is 144 dpi");
  assert.equal(matches({ query: "(resolution >= 2x)" }), false);
  assert.equal(matches({ query: "(max-resolution: 60dpcm)" }), true);
  assert.equal(matches({ query: "(-webkit-min-device-pixel-ratio: 1.5)" }), true);
  assert.equal(matches({ query: "(aspect-ratio: 4/3)" }), true);
  assert.equal(matches({ query: "(min-aspect-ratio: 16/9)" }), false);
});

test("an unknown feature never matches, its negation does not either, and parse reports it", () => {
  assert.equal(matches({ query: "(made-up: 1)" }), false);
  assert.equal(matches({ query: "not (made-up: 1)" }), false);
  assert.deepEqual(parseMediaList("(made-up: 1) and (color)").unknown, ["made-up"]);
  assert.deepEqual(parseMediaList("(min-width: 1px)").unknown, []);
});

test("a width is unknown without a window", () => {
  const inputs = fakeInputs({ viewport: () => null });
  assert.equal(
    matches({
      query: "(min-width: 1px)",
      inputs
    }), false
  );
  assert.equal(
    matches({
      query: "(orientation: portrait)",
      inputs
    }), false
  );
});

// One row per feature: a query that holds and one that does not, with the inputs that make the first hold.
const FEATURE_CASES: ReadonlyArray<{
  feature: string;
  inputs?: Partial<MediaInputs>;
  holds: string;
  fails: string;
}> = [
  {
    feature: "width",
    holds: "(width: 800px)",
    fails: "(width: 801px)"
  },
  {
    feature: "height",
    holds: "(height: 600px)",
    fails: "(height: 1px)"
  },
  {
    feature: "aspect-ratio",
    holds: "(aspect-ratio: 4/3)",
    fails: "(aspect-ratio: 1/1)"
  },
  {
    feature: "orientation",
    holds: "(orientation: landscape)",
    fails: "(orientation: portrait)"
  },
  {
    feature: "device-width",
    holds: "(device-width: 1920px)",
    fails: "(device-width: 800px)"
  },
  {
    feature: "device-height",
    holds: "(device-height: 1080px)",
    fails: "(device-height: 600px)"
  },
  {
    feature: "device-aspect-ratio",
    holds: "(device-aspect-ratio: 16/9)",
    fails: "(device-aspect-ratio: 4/3)"
  },
  {
    feature: "resolution",
    holds: "(resolution: 1.5dppx)",
    fails: "(resolution: 1dppx)"
  },
  {
    feature: "-webkit-device-pixel-ratio",
    holds: "(-webkit-device-pixel-ratio: 1.5)",
    fails: "(-webkit-device-pixel-ratio: 1)"
  },
  {
    feature: "display-mode",
    inputs: {
      presentation: () => MediaPresentation.fullScreen
    },
    holds: "(display-mode: fullscreen)",
    fails: "(display-mode: standalone)"
  },
  {
    feature: "color",
    holds: "(color: 8)",
    fails: "(color: 10)"
  },
  {
    feature: "color-index",
    holds: "(color-index: 0)",
    fails: "(min-color-index: 1)"
  },
  {
    feature: "monochrome",
    holds: "(monochrome: 0)",
    fails: "(min-monochrome: 1)"
  },
  {
    feature: "color-gamut",
    inputs: {
      gamut: () => ColorGamut.p3
    },
    holds: "(color-gamut: p3) and (color-gamut: srgb)",
    fails: "(color-gamut: rec2020)"
  },
  {
    feature: "dynamic-range",
    inputs: {
      isHdr: () => true
    },
    holds: "(dynamic-range: high)",
    fails: "(dynamic-range: nonsense)"
  },
  {
    feature: "video-dynamic-range",
    holds: "(video-dynamic-range: standard)",
    fails: "(video-dynamic-range: high)"
  },
  {
    feature: "grid",
    holds: "(grid: 0)",
    fails: "(grid: 1)"
  },
  {
    feature: "hover",
    holds: "(hover: hover)",
    fails: "(hover: none)"
  },
  {
    feature: "any-hover",
    holds: "(any-hover)",
    fails: "(any-hover: none)"
  },
  {
    feature: "pointer",
    holds: "(pointer: fine)",
    fails: "(pointer: coarse)"
  },
  {
    feature: "any-pointer",
    inputs: {
      devices: () => ({
        canHover: true,
        hasFinePointer: true,
        hasCoarsePointer: true
      })
    },
    holds: "(any-pointer: fine) and (any-pointer: coarse)",
    fails: "(any-pointer: none)"
  },
  {
    feature: "scan",
    holds: "(scan: progressive)",
    fails: "(scan: interlace)"
  },
  {
    feature: "update",
    holds: "(update: fast)",
    fails: "(update: slow)"
  },
  {
    feature: "overflow-block",
    holds: "(overflow-block: scroll)",
    fails: "(overflow-block: paged)"
  },
  {
    feature: "overflow-inline",
    holds: "(overflow-inline: scroll)",
    fails: "(overflow-inline: none)"
  },
  {
    feature: "scripting",
    holds: "(scripting: enabled)",
    fails: "(scripting: none)"
  },
  {
    feature: "prefers-color-scheme",
    inputs: {
      isDark: () => true
    },
    holds: "(prefers-color-scheme: dark)",
    fails: "(prefers-color-scheme: light)"
  },
  {
    feature: "prefers-contrast",
    inputs: {
      isHighContrast: () => true
    },
    holds: "(prefers-contrast: more) and (prefers-contrast)",
    fails: "(prefers-contrast: no-preference)"
  },
  {
    feature: "prefers-reduced-motion",
    inputs: {
      isAnimationEnabled: () => false
    },
    holds: "(prefers-reduced-motion: reduce) and (prefers-reduced-motion)",
    fails: "(prefers-reduced-motion: no-preference)"
  },
  {
    feature: "prefers-reduced-transparency",
    inputs: {
      isTransparencyEnabled: () => false
    },
    holds: "(prefers-reduced-transparency: reduce)",
    fails: "(prefers-reduced-transparency: no-preference)"
  },
  {
    feature: "prefers-reduced-data",
    inputs: {
      isMetered: () => true
    },
    holds: "(prefers-reduced-data: reduce)",
    fails: "(prefers-reduced-data: no-preference)"
  },
  {
    feature: "forced-colors",
    inputs: {
      isHighContrast: () => true
    },
    holds: "(forced-colors: active) and (forced-colors)",
    fails: "(forced-colors: none)"
  },
  {
    feature: "inverted-colors",
    holds: "(inverted-colors: none)",
    fails: "(inverted-colors: inverted)"
  },
  {
    feature: "light-level",
    holds: "(light-level: normal)",
    fails: "(light-level: dim)"
  },
  {
    feature: "nav-controls",
    holds: "(nav-controls: back)",
    fails: "(nav-controls: none)"
  },
  {
    feature: "horizontal-viewport-segments",
    holds: "(horizontal-viewport-segments: 1)",
    fails: "(horizontal-viewport-segments: 2)"
  },
  {
    feature: "vertical-viewport-segments",
    holds: "(vertical-viewport-segments: 1)",
    fails: "(min-vertical-viewport-segments: 2)"
  },
  {
    feature: "device-posture",
    holds: "(device-posture: continuous)",
    fails: "(device-posture: folded)"
  }
];

test("every feature of the table has a case", () => {
  assert.deepEqual([...MEDIA_FEATURES.keys()].sort(), FEATURE_CASES.map(({ feature }) => feature).sort());
});

for (const { feature, inputs, holds, fails } of FEATURE_CASES) {
  test(`feature ${feature}`, () => {
    const withInputs = fakeInputs(inputs);
    assert.equal(
      matches({
        query: holds,
        inputs: withInputs
      }), true, holds
    );
    assert.equal(
      matches({
        query: fails,
        inputs: withInputs
      }), false, fails
    );
  });
}

test("a feature says which changes can flip it", () => {
  assert.deepEqual([...changesOf(parseMediaList("(prefers-reduced-motion) and (min-width: 1px)"))].sort(), ["settings", "viewport"]);
  assert.deepEqual([...changesOf(parseMediaList("screen"))], []);
});

test("media text is normalised", () => {
  assert.equal(normalizedMedia("  SCREEN   and (Min-Width:600px) ,print"), "screen and (min-width:600px), print");
});
