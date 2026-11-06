import { boxOf, tracksOf } from "./css-box.ts";
import { colorChannelsOf } from "./css-color.ts";
import { contrastRatio, ratioText, verdictOf } from "./css-contrast.ts";
import { declarationInfo } from "./css-declaration-info.ts";
import { easingOf, keySplineOf, timingsOf } from "./css-easing.ts";
import { brushGradientsOf, gradientsOf } from "./css-gradient.ts";
import {
  isHandledProperty,
  materials,
  namedEasings,
  shadowDepths,
  unsupportedReasons,
  winuiTargets
} from "./css-ide-data.ts";
import { evaluateMedia } from "./css-media.ts";
import type { MediaEnvironment } from "./css-media.ts";
import { cssPreviewsOf, PreviewFeature } from "./css-previews.ts";
import { cssDeclarationsOf, DeclarationSource, mediaQueriesOf } from "./css-scan.ts";
import { materialOf, nearestStep, shadowDepthOf } from "./css-shadow.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";

// The logic spec both editors implement: ide/css-previews.spec.json holds the inputs and the answers, and the
// Kotlin core (ide/webstorm) is tested against the same file.

const SAMPLE_INDEXES = [0, 5, 10, 15, 20];
const FEATURES = new Set(Object.values(PreviewFeature));
const spec = z.object({
  gradients: z.array(
    z.object({
      value: z.string(),
      expected: z.array(z.unknown())
    })
  ),
  brushes: z.array(
    z.object({
      text: z.string(),
      expected: z.array(z.unknown())
    })
  ),
  contrasts: z.array(
    z.object({
      foreground: z.string(),
      background: z.string(),
      label: z.string()
    })
  ),
  easings: z.array(
    z.object({
      value: z.string(),
      samples: z.array(z.number()).nullable()
    })
  ),
  keySplines: z.array(
    z.object({
      value: z.string(),
      samples: z.array(z.number()).nullable()
    })
  ),
  timings: z.array(
    z.object({
      property: z.string(),
      value: z.string(),
      expected: z.array(z.unknown())
    })
  ),
  boxes: z.array(
    z.object({
      property: z.string(),
      value: z.string(),
      expected: z.object({
        kind: z.string(),
        values: z.array(z.number())
      }).nullable()
    })
  ),
  tracks: z.array(
    z.object({
      value: z.string(),
      expected: z.array(z.tuple([z.string(), z.number(), z.number()])).nullable()
    })
  ),
  media: z.array(
    z.object({
      environment: z.object({
        theme: z.enum(["light", "dark"]),
        isReducedMotion: z.boolean(),
        width: z.number(),
        height: z.number()
      }),
      condition: z.string(),
      matches: z.boolean().nullable(),
      parts: z.array(z.tuple([z.string(), z.boolean().nullable()]))
    })
  ),
  shadows: z.array(
    z.object({
      property: z.string(),
      value: z.string(),
      depth: z.number().nullable()
    })
  ),
  ladder: z.array(
    z.object({
      depth: z.number(),
      nearest: z.number()
    })
  ),
  materials: z.array(
    z.object({
      value: z.string(),
      name: z.string().nullable()
    })
  ),
  attributeProperties: z.record(z.string(), z.string()),
  declarations: z.array(
    z.object({
      text: z.string(),
      expected: z.array(z.unknown())
    })
  ),
  mediaQueries: z.array(
    z.object({
      text: z.string(),
      expected: z.array(z.unknown())
    })
  ),
  infos: z.array(
    z.object({
      property: z.string(),
      source: z.enum(Object.values(DeclarationSource)),
      media: z.array(z.string()).optional(),
      expected: z.unknown()
    })
  )
}).parse(JSON.parse(readFileSync(path.join(import.meta.dirname, "..", "..", "css-previews.spec.json"), "utf8")));

function samplesAt(samples: number[] | undefined) {
  return samples === undefined ? null : SAMPLE_INDEXES.map(i => samples[i]);
}

function stopsOf(gradients: ReturnType<typeof gradientsOf>) {
  return gradients.map(gradient => ({
    kind: gradient.kind,
    stops: gradient.stops.map(stop => [stop.color, stop.position])
  }));
}

test("a gradient has its stops resolved to colors and positions", () => {
  for (const { value, expected } of spec.gradients) {
    assert.deepEqual(stopsOf(gradientsOf(value)), expected, value);
  }
});

test("a brush of gradient stops reads like a CSS gradient", () => {
  for (const { text, expected } of spec.brushes) {
    assert.deepEqual(stopsOf(brushGradientsOf(text)), expected, text);
  }
});

test("a pair of colors has its WCAG ratio and verdict", () => {
  for (const { foreground, background, label } of spec.contrasts) {
    const ratio = contrastRatio({
      foreground: colorChannelsOf(foreground) ?? assert.fail(foreground),
      background: colorChannelsOf(background) ?? assert.fail(background)
    });
    assert.equal(`${ratioText(ratio)} ${verdictOf(ratio)}`, label, `${foreground} on ${background}`);
  }
});

test("an easing is sampled into the curve it draws", () => {
  const named = namedEasings();
  for (const { value, samples } of spec.easings) {
    assert.deepEqual(
      samplesAt(
        easingOf({
          value,
          named
        })?.samples
      ), samples, value
    );
  }

  for (const { value, samples } of spec.keySplines) {
    assert.deepEqual(samplesAt(keySplineOf(value)), samples, value);
  }
});

test("a transition and an animation have their durations and delays", () => {
  for (const { property, value, expected } of spec.timings) {
    assert.deepEqual(
      timingsOf({
        property,
        value,
        named: namedEasings()
      }), expected, value
    );
  }
});

test("a box value is expanded to four sides in pixels, and any other unit is refused", () => {
  for (const { property, value, expected } of spec.boxes) {
    const box = boxOf({
      property,
      value
    });
    assert.deepEqual(
      box === undefined ? null : {
        kind: box.kind,
        values: box.values
      }, expected, `${property}: ${value}`
    );
  }
});

test("grid tracks get a share of the bar", () => {
  for (const { value, expected } of spec.tracks) {
    const tracks = tracksOf(value);
    assert.deepEqual(tracks?.map(track => [track.kind, track.amount, track.share]) ?? null, expected, value);
  }
});

test("a media condition is evaluated against the assumed environment", () => {
  for (const { environment, condition, matches: isExpected, parts } of spec.media) {
    const result = evaluateMedia({
      condition,
      environment: environment satisfies MediaEnvironment
    });
    assert.equal(result.matches ?? null, isExpected, `${condition} in ${JSON.stringify(environment)}`);
    assert.deepEqual(result.parts.map(part => [part.text, part.matches ?? null]), parts, condition);
  }
});

test("a shadow has a depth, and a depth is placed on the ladder", () => {
  for (const { property, value, depth } of spec.shadows) {
    assert.equal(
      shadowDepthOf({
        property,
        value
      }) ?? null, depth, `${property}: ${value}`
    );
  }

  for (const { depth, nearest } of spec.ladder) {
    assert.equal(
      nearestStep({
        depth,
        steps: shadowDepths()
      }), nearest, String(depth)
    );
  }

  for (const { value, name } of spec.materials) {
    assert.equal(
      materialOf({
        property: "backdrop",
        value,
        materials: materials()
      })?.name ?? null, name, value
    );
  }
});

test("the declarations of a file are found in the style block, the style attribute and the props", () => {
  const attributeProperties = new Map(Object.entries(spec.attributeProperties));
  for (const { text, expected } of spec.declarations) {
    const found = cssDeclarationsOf({
      text,
      attributeProperties
    }).map(declaration => [
      declaration.property,
      declaration.value,
      declaration.group,
      declaration.source,
      declaration.selector,
      declaration.media,
      text.slice(declaration.valueStart, declaration.valueEnd)
    ]);
    assert.deepEqual(found, expected, text);
  }

  for (const { text, expected } of spec.mediaQueries) {
    const queries = mediaQueriesOf(text).map(query => [query.condition, text.slice(query.start, query.end)]);
    assert.deepEqual(queries, expected);
  }
});

test("a declaration says what it becomes in WinUI, or why it cannot", () => {
  for (const { property, source, media, expected } of spec.infos) {
    const info = declarationInfo({
      declaration: {
        property,
        value: "x",
        start: 0,
        valueStart: 0,
        valueEnd: 1,
        group: 0,
        source,
        selector: ".a",
        media: media ?? []
      },
      unsupported: unsupportedReasons(),
      targets: winuiTargets(),
      isHandled: isHandledProperty
    });
    assert.deepEqual(
      info === undefined ? null : {
        isSupported: info.isSupported,
        targets: info.targets,
        reason: info.reason,
        scope: info.scope
      }, expected, property
    );
  }
});

test("every feature gives previews in text order, and none when it is off", () => {
  const text = [
    "<style>",
    ".a { color: #767676; background: #fff; background-image: linear-gradient(red, blue); transition: opacity 1s ease; }",
    ".b { padding: 4px 8px; grid-template-columns: 1fr 2fr; -winui-elevation: 16px; float: left; }",
    "@media (prefers-color-scheme: dark) { .c { color: red } }",
    "</style>",
    "<Window backdrop=\"mica\" />"
  ].join("\n");
  const environment = {
    theme: "dark",
    isReducedMotion: false,
    width: 1024,
    height: 768
  } as const;
  const tables = {
    attributeProperties: new Map<string, string>(),
    easings: namedEasings(),
    shadowDepths: shadowDepths(),
    materials: materials(),
    unsupported: unsupportedReasons(),
    targets: winuiTargets(),
    isHandled: isHandledProperty
  };
  const previews = cssPreviewsOf({
    text,
    features: FEATURES,
    environment,
    tables
  });
  assert.deepEqual(new Set(previews.map(preview => preview.feature)), FEATURES);
  const starts = previews.map(preview => preview.start);
  assert.deepEqual(starts, starts.toSorted((left, right) => left - right));
  assert.equal(previews.find(preview => preview.hint?.label === "now: yes")?.feature, PreviewFeature.MEDIA);
  assert.equal(previews.find(preview => preview.feature === PreviewFeature.CONTRAST)?.hint?.label, "4.5:1 AA");
  assert.equal(
    cssPreviewsOf({
      text,
      features: new Set(),
      environment,
      tables
    }).length, 0
  );
});
