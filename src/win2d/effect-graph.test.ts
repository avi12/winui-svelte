import { clear, drawImage } from "./draw.ts";
import { buildEffectGraph, drawableBlendModes } from "./effect-graph.ts";
import {
  bitmapFromColors,
  createRenderTarget,
  pixelAt,
  readPixels,
  sharedDevice
} from "./resources.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { parseFilterList } from "#src/css/parse/filters.js";
import { BLEND_MODES, NO_EFFECTS } from "#src/css/parse/visual-effects.js";
import type { VisualEffects } from "#src/css/parse/visual-effects.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import { Transform2DEffect } from "#winui/microsoft/graphics/canvas/effects/Transform2DEffect";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The effect graph of the CSS filters, headless: the graph is built over
// bitmaps, drawn on a render target, and its pixels read back. Skipped where
// the Win2D library was not restored (pnpm restore) or the bindings were not
// built (pnpm build).

const SIZE = 16;
const HALF = SIZE / 2;
const SLACK = 3;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
const IS_AVAILABLE = existsSync(NATIVE_LIBRARY) && existsSync(BINDINGS);
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
}

interface Color {
  a: number;
  r: number;
  g: number;
  b: number;
}

function solid(color: {
  r: number;
  g: number;
  b: number;
  a?: number;
}) {
  return bitmapFromColors({
    creator: sharedDevice(),
    colors: Array.from({ length: SIZE * SIZE }, () => ({
      a: 255,
      ...color
    })),
    width: SIZE,
    height: SIZE
  });
}

function stripes() {
  return bitmapFromColors({
    creator: sharedDevice(),
    colors: Array.from({ length: SIZE * SIZE }, (_color, i) => i % SIZE < HALF ? {
      a: 255,
      r: 255,
      g: 0,
      b: 0
    } : {
      a: 255,
      r: 0,
      g: 0,
      b: 255
    }),
    width: SIZE,
    height: SIZE
  });
}

function graphOf({ filter = "none", backdropFilter = "none", blend = null, hasMask = false, images }: {
  filter?: string;
  backdropFilter?: string;
  blend?: string | null;
  hasMask?: boolean;
  images: {
    source: ReturnType<typeof solid>;
    backdrop: ReturnType<typeof solid>;
    mask: ReturnType<typeof solid>;
  };
}) {
  function read(text: string) {
    const result = parseFilterList(text);
    assert.ok(result.isValid, text);
    return result.steps;
  }

  const effects: VisualEffects = {
    ...NO_EFFECTS,
    filter: [...read(filter)],
    backdrop: [...read(backdropFilter)],
    blend,
    mask: hasMask ? {
      kind: "image",
      url: "unused"
    } : null
  };
  return buildEffectGraph({
    effects,
    sources: {
      ...images,
      shifted({ x, y }) {
        const moved = new Transform2DEffect();
        moved.source = images.source;
        moved.transformMatrix = {
          m11: 1,
          m12: 0,
          m21: 0,
          m22: 1,
          m31: x,
          m32: y
        };
        return moved;
      }
    }
  });
}

function render(image: Parameters<typeof drawImage>[0]["image"]) {
  const target = createRenderTarget({
    creator: sharedDevice(),
    width: SIZE,
    height: SIZE
  });
  const session = target.createDrawingSession();
  clear({
    session,
    color: {
      a: 0,
      r: 0,
      g: 0,
      b: 0
    }
  });
  drawImage({
    session,
    image
  });
  session.close();
  return readPixels(target);
}

function assertColor({ actual, expected }: {
  actual: Color;
  expected: Color;
}) {
  for (const channel of ["a", "r", "g", "b"] as const) {
    assert.ok(Math.abs(actual[channel] - expected[channel]) <= SLACK, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
  }
}

function centerOf(pixels: ReturnType<typeof readPixels>) {
  return pixelAt({
    pixels,
    x: HALF,
    y: HALF
  });
}

const GRAY = {
  r: 128,
  g: 128,
  b: 128
};
const RED = {
  r: 255,
  g: 0,
  b: 0
};

function images({ source = RED, backdrop = GRAY, mask = GRAY, maskAlpha = 255 }: {
  source?: typeof RED;
  backdrop?: typeof GRAY;
  mask?: typeof GRAY;
  maskAlpha?: number;
} = {}) {
  return {
    source: solid(source),
    backdrop: solid(backdrop),
    mask: solid({
      ...mask,
      a: maskAlpha
    })
  };
}

test("every blend mode the parser knows has a Win2D blend mode, and the other way round", () => {
  assert.deepEqual([...BLEND_MODES].toSorted(), drawableBlendModes().toSorted());
});

test("grayscale(1) turns a red pixel to its luminance", { skip: !IS_AVAILABLE }, () => {
  const pixels = render(
    graphOf({
      filter: "grayscale(1)",
      images: images()
    })
  );
  assertColor({
    actual: centerOf(pixels),
    expected: {
      a: 255,
      r: 54,
      g: 54,
      b: 54
    }
  });
});

test("invert(1) turns red to cyan, and brightness(0.5) halves a channel", { skip: !IS_AVAILABLE }, () => {
  assertColor({
    actual: centerOf(
      render(
        graphOf({
          filter: "invert(1)",
          images: images()
        })
      )
    ),
    expected: {
      a: 255,
      r: 0,
      g: 255,
      b: 255
    }
  });
  assertColor({
    actual: centerOf(
      render(
        graphOf({
          filter: "brightness(0.5)",
          images: images()
        })
      )
    ),
    expected: {
      a: 255,
      r: 128,
      g: 0,
      b: 0
    }
  });
});

test("opacity(0.5) halves the alpha of the pixel", { skip: !IS_AVAILABLE }, () => {
  const { a } = centerOf(
    render(
      graphOf({
        filter: "opacity(0.5)",
        images: images()
      })
    )
  );
  assert.ok(Math.abs(a - HALF * 16) <= SLACK, `alpha ${a}`);
});

test("blur softens the edge between two colours", { skip: !IS_AVAILABLE }, () => {
  const sharp = render(stripes());
  const soft = render(
    graphOf({
      filter: "blur(2px)",
      images: {
        ...images(),
        source: stripes()
      }
    })
  );
  function edgeOf(pixels: ReturnType<typeof readPixels>) {
    return pixelAt({
      pixels,
      x: HALF - 1,
      y: HALF
    });
  }

  assert.equal(edgeOf(sharp).b, 0);
  assert.ok(edgeOf(soft).b > 0 && edgeOf(soft).r < RED.r, `the edge is still sharp: ${JSON.stringify(edgeOf(soft))}`);
});

test("drop-shadow puts a copy of the alpha below the pixel, offset", { skip: !IS_AVAILABLE }, () => {
  const dot = bitmapFromColors({
    creator: sharedDevice(),
    colors: Array.from({ length: SIZE * SIZE }, (_color, i) => i === 4 * SIZE + 4 ? {
      a: 255,
      r: 255,
      g: 255,
      b: 255
    } : {
      a: 0,
      r: 0,
      g: 0,
      b: 0
    }),
    width: SIZE,
    height: SIZE
  });
  const pixels = render(
    graphOf({
      filter: "drop-shadow(4px 4px 0 #000000)",
      images: {
        ...images(),
        source: dot
      }
    })
  );
  assertColor({
    actual: pixelAt({
      pixels,
      x: 4,
      y: 4
    }),
    expected: {
      a: 255,
      r: 255,
      g: 255,
      b: 255
    }
  });
  const shadow = pixelAt({
    pixels,
    x: 8,
    y: 8
  });
  assert.ok(shadow.a > 128 && shadow.r < 32, `no shadow at the offset: ${JSON.stringify(shadow)}`);
});

test("a mask's alpha is the pixel's alpha", { skip: !IS_AVAILABLE }, () => {
  const { a } = centerOf(
    render(
      graphOf({
        hasMask: true,
        images: images({ maskAlpha: 128 })
      })
    )
  );
  assert.ok(Math.abs(a - 128) <= SLACK, `alpha ${a}`);
});

test("multiply blends the pixel with the backdrop", { skip: !IS_AVAILABLE }, () => {
  assertColor({
    actual: centerOf(
      render(
        graphOf({
          blend: "multiply",
          images: images()
        })
      )
    ),
    expected: {
      a: 255,
      r: 128,
      g: 0,
      b: 0
    }
  });
});

test("a backdrop filter draws the filtered backdrop under a pixel that lets it through", { skip: !IS_AVAILABLE }, () => {
  assertColor({
    actual: centerOf(
      render(
        graphOf({
          backdropFilter: "invert(1)",
          images: {
            ...images({
              backdrop: {
                r: 255,
                g: 0,
                b: 0
              }
            }),
            source: solid({
              r: 0,
              g: 0,
              b: 0,
              a: 0
            })
          }
        })
      )
    ),
    expected: {
      a: 255,
      r: 0,
      g: 255,
      b: 255
    }
  });
});
