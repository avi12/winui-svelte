import {
  clear,
  drawImage,
  drawLine,
  drawText,
  fillCircle,
  fillGeometry,
  fillRectangle,
  setTransform
} from "./draw.ts";
import {
  IDENTITY,
  multiply,
  rotation,
  scaling,
  translation
} from "./matrix.ts";
import {
  bitmapFromColors,
  createRenderTarget,
  createTextFormat,
  pixelAt,
  polylineGeometry,
  readPixels,
  sharedDevice
} from "./resources.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Win2D drawing, headless: a CanvasRenderTarget has no window, so each test
// draws and reads the pixels back. Skipped where the Win2D library was not
// restored (pnpm restore) or the bindings were not built (pnpm build).

const SIZE = 32;
const MIDDLE = SIZE / 2;
const RED = {
  a: 255,
  r: 255,
  g: 0,
  b: 0
};
const BLUE = {
  a: 255,
  r: 0,
  g: 0,
  b: 255
};
const BLACK = {
  a: 255,
  r: 0,
  g: 0,
  b: 0
};
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
const IS_AVAILABLE = existsSync(NATIVE_LIBRARY) && existsSync(BINDINGS);
const SLACK = 2;
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
}

function render(draw: (session: ReturnType<ReturnType<typeof createRenderTarget>["createDrawingSession"]>) => void) {
  const device = sharedDevice();
  const target = createRenderTarget({
    creator: device,
    width: SIZE,
    height: SIZE
  });
  const session = target.createDrawingSession();
  clear({
    session,
    color: BLACK
  });
  draw(session);
  session.close();
  return readPixels(target);
}

function assertColor({ actual, expected }: {
  actual: ReturnType<typeof pixelAt>;
  expected: typeof RED;
}) {
  for (const channel of ["a", "r", "g", "b"] as const) {
    assert.ok(Math.abs(actual[channel] - expected[channel]) <= SLACK, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
  }
}

test("a rectangle filled with a color, and one with a brush, both paint", { skip: !IS_AVAILABLE }, async () => {
  const brushes = await import("#winui/microsoft/graphics/canvas/brushes/CanvasSolidColorBrush");
  const pixels = render(session => {
    fillRectangle({
      session,
      x: 0,
      y: 0,
      width: MIDDLE,
      height: SIZE,
      paint: RED
    });
    fillRectangle({
      session,
      x: MIDDLE,
      y: 0,
      width: MIDDLE,
      height: SIZE,
      paint: new brushes.CanvasSolidColorBrush(sharedDevice(), BLUE)
    });
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: 4,
      y: 4
    }),
    expected: RED
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: SIZE - 4,
      y: 4
    }),
    expected: BLUE
  });
});

test("a circle and a line are drawn where they are asked", { skip: !IS_AVAILABLE }, () => {
  const pixels = render(session => {
    fillCircle({
      session,
      x: MIDDLE,
      y: MIDDLE,
      radius: 6,
      paint: RED
    });
    drawLine({
      session,
      from: {
        x: 0,
        y: 2
      },
      to: {
        x: SIZE,
        y: 2
      },
      paint: BLUE,
      strokeWidth: 2
    });
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: RED
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: MIDDLE,
      y: 2
    }),
    expected: BLUE
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: 1,
      y: SIZE - 1
    }),
    expected: BLACK
  });
});

test("a transform moves what is drawn after it, and setting it back restores", { skip: !IS_AVAILABLE }, () => {
  const pixels = render(session => {
    const previous = setTransform({
      session,
      matrix: multiply({
        first: scaling({
          x: 2,
          y: 2
        }),
        second: translation({
          x: 8,
          y: 8
        })
      })
    });
    fillRectangle({
      session,
      x: 0,
      y: 0,
      width: 4,
      height: 4,
      paint: RED
    });
    setTransform({
      session,
      matrix: previous
    });
    fillRectangle({
      session,
      x: 0,
      y: 0,
      width: 2,
      height: 2,
      paint: BLUE
    });
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: 12,
      y: 12
    }),
    expected: RED
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: 1,
      y: 1
    }),
    expected: BLUE
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: 5,
      y: 5
    }),
    expected: BLACK
  });
});

test("a geometry from lines is filled", { skip: !IS_AVAILABLE }, () => {
  const geometry = polylineGeometry({
    creator: sharedDevice(),
    figures: [{
      start: {
        x: 4,
        y: 4
      },
      lines: [{
        x: 28,
        y: 4
      }, {
        x: 28,
        y: 28
      }, {
        x: 4,
        y: 28
      }],
      isClosed: true
    }]
  });
  const pixels = render(session => fillGeometry({
    session,
    geometry,
    paint: RED
  }));
  assertColor({
    actual: pixelAt({
      pixels,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: RED
  });
  assertColor({
    actual: pixelAt({
      pixels,
      x: 1,
      y: 1
    }),
    expected: BLACK
  });
});

test("a text puts pixels where it is written", { skip: !IS_AVAILABLE }, () => {
  const pixels = render(session => drawText({
    session,
    text: "W",
    x: 2,
    y: 2,
    paint: RED,
    format: createTextFormat({ size: 24 })
  }));
  const lit = pixels.bytes.filter((_byte, i) => i % pixels.bytesPerPixel === 2 && _byte > 0);
  assert.ok(lit.length > 0, "no pixel of the text has red in it");
});

test("a bitmap from colors is drawn, and a blur effect softens its edge", { skip: !IS_AVAILABLE }, async () => {
  const effects = await import("#winui/microsoft/graphics/canvas/effects/GaussianBlurEffect");
  const device = sharedDevice();
  const colors = Array.from({ length: 4 * 4 }, (_color, i) => i % 4 < 2 ? RED : BLUE);
  const bitmap = bitmapFromColors({
    creator: device,
    colors,
    width: 4,
    height: 4
  });
  const sharp = render(session => drawImage({
    session,
    image: bitmap
  }));
  assertColor({
    actual: pixelAt({
      pixels: sharp,
      x: 1,
      y: 1
    }),
    expected: RED
  });
  assertColor({
    actual: pixelAt({
      pixels: sharp,
      x: 2,
      y: 1
    }),
    expected: BLUE
  });
  const blur = new effects.GaussianBlurEffect();
  blur.source = bitmap;
  blur.blurAmount = 2;
  const soft = render(session => drawImage({
    session,
    image: blur
  }));
  const edge = pixelAt({
    pixels: soft,
    x: 1,
    y: 1
  });
  assert.ok(edge.b > 0 && edge.r < RED.r, `the blurred edge is still sharp: ${JSON.stringify(edge)}`);
});

test("rotating by a quarter turn around a point keeps that point still", () => {
  const turned = rotation({
    radians: Math.PI / 2,
    centerX: 10,
    centerY: 10
  });
  const x = 10 * turned.m11 + 10 * turned.m21 + turned.m31;
  const y = 10 * turned.m12 + 10 * turned.m22 + turned.m32;
  assert.ok(Math.abs(x - 10) < 1e-9 && Math.abs(y - 10) < 1e-9);
  assert.deepEqual(
    multiply({
      first: IDENTITY,
      second: IDENTITY
    }), IDENTITY
  );
});
