import { createCanvas2D } from "./canvas-element.ts";
import { colorFromCss } from "./css-color.ts";
import { parseFont } from "./font.ts";
import { ImageData } from "./image-data.ts";
import { Path2D } from "./path.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { bitmapFromColors, pixelAt, readPixels } from "#src/win2d/resources.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// The Canvas 2D context, headless: a canvas draws on a render target without a
// window, so each test draws and reads the pixels back. Skipped where the Win2D
// library was not restored (pnpm restore) or the bindings were not built
// (pnpm build).

const SIZE = 32;
const MIDDLE = SIZE / 2;
const SLACK = 3;
const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
const IS_AVAILABLE = existsSync(NATIVE_LIBRARY) && existsSync(BINDINGS);
const RED = {
  a: 255,
  r: 255,
  g: 0,
  b: 0
};
const GREEN = {
  a: 255,
  r: 0,
  g: 128,
  b: 0
};
const BLUE = {
  a: 255,
  r: 0,
  g: 0,
  b: 255
};
const CLEAR = {
  a: 0,
  r: 0,
  g: 0,
  b: 0
};
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
}

function canvasOf(size = SIZE) {
  const canvas = createCanvas2D({
    width: size,
    height: size
  });
  const context = canvas.getContext("2d");
  assert.ok(context);
  return {
    canvas,
    context
  };
}

function colorAt({ canvas, x, y }: {
  canvas: ReturnType<typeof createCanvas2D>;
  x: number;
  y: number;
}) {
  return pixelAt({
    pixels: readPixels(canvas.target),
    x,
    y
  });
}

function assertColor({ actual, expected }: {
  actual: ReturnType<typeof pixelAt>;
  expected: typeof RED;
}) {
  for (const channel of ["a", "r", "g", "b"] as const) {
    assert.ok(Math.abs(actual[channel] - expected[channel]) <= SLACK, `${JSON.stringify(actual)} is not ${JSON.stringify(expected)}`);
  }
}

test("CSS colors and font shorthands are read in house", () => {
  assert.deepEqual(colorFromCss("red"), RED);
  assert.deepEqual(colorFromCss("#00f"), BLUE);
  assert.deepEqual(colorFromCss("rgb(0, 128, 0)"), GREEN);
  assert.deepEqual(colorFromCss("rgba(0, 0, 0, 0)"), CLEAR);
  assert.equal(colorFromCss("not a color"), undefined);
  assert.deepEqual(parseFont("italic bold 12pt \"Segoe UI\", sans-serif"), {
    slant: "italic",
    weight: 700,
    size: 16,
    family: "Segoe UI"
  });
  assert.deepEqual(parseFont("600 20px/1.5 monospace"), {
    slant: "normal",
    weight: 600,
    size: 20,
    family: "Consolas"
  });
  assert.equal(parseFont("bold sans-serif"), undefined);
  assert.equal(parseFont("12px"), undefined);
});

test("a Path2D reads an SVG path and follows the same calls as a context", () => {
  const square = new Path2D("M 2 2 h 4 v 4 h -4 z");
  assert.deepEqual(square.segments.map(segment => segment.kind), ["move", "line", "line", "line", "close"]);
  const rounded = new Path2D();
  rounded.roundRect(0, 0, 10, 10, 3);
  assert.ok(rounded.segments.length > 8);
  const copy = new Path2D(square);
  assert.equal(copy.segments.length, square.segments.length);
  assert.throws(() => rounded.arc(0, 0, -1, 0, 1), RangeError);
});

test("a canvas has the members a library reads", { skip: !IS_AVAILABLE }, () => {
  const canvas = createCanvas2D();
  assert.equal(canvas.width, 300);
  assert.equal(canvas.height, 150);
  assert.equal(canvas.getContext("webgl"), null);
  assert.equal(canvas.getContext("2d"), canvas.getContext("2d"));
  canvas.style.setProperty("box-sizing", "border-box");
  assert.equal(canvas.style.boxSizing, "border-box");
  assert.deepEqual(canvas.getBoundingClientRect(), {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 300,
    bottom: 150,
    width: 300,
    height: 150
  });
  const seen: string[] = [];
  canvas.addEventListener("pointerdown", event => seen.push(`${event.type}:${String(event["clientX"])}`));
  canvas.dispatchEvent({
    type: "pointerdown",
    clientX: 7
  });
  assert.deepEqual(seen, ["pointerdown:7"]);
});

test("fillRect fills with the fill style, and setting the size clears and resets", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.fillRect(0, 0, MIDDLE, SIZE);
  context.fillStyle = "#0000ff";
  context.fillRect(MIDDLE, 0, MIDDLE, SIZE);
  assert.equal(context.fillStyle, "#0000ff");
  assertColor({
    actual: colorAt({
      canvas,
      x: 4,
      y: 4
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: SIZE - 4,
      y: 4
    }),
    expected: BLUE
  });
  canvas.width = SIZE;
  assert.equal(context.fillStyle, "#000000");
  assertColor({
    actual: colorAt({
      canvas,
      x: 4,
      y: 4
    }),
    expected: CLEAR
  });
});

test("stroke draws a line of the line width in the stroke style", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.strokeStyle = "rgb(0, 128, 0)";
  context.lineWidth = 4;
  context.beginPath();
  context.moveTo(0, MIDDLE);
  context.lineTo(SIZE, MIDDLE);
  context.stroke();
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: GREEN
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: MIDDLE - 3
    }),
    expected: CLEAR
  });
  context.lineWidth = -1;
  assert.equal(context.lineWidth, 4);
});

test("fill takes the nonzero or the even-odd rule", { skip: !IS_AVAILABLE }, () => {
  const nonzero = canvasOf();
  const evenodd = canvasOf();
  for (const { context, rule } of [
    {
      context: nonzero.context,
      rule: "nonzero"
    },
    {
      context: evenodd.context,
      rule: "evenodd"
    }
  ] as const) {
    context.fillStyle = "red";
    context.beginPath();
    context.rect(2, 2, 28, 28);
    context.rect(10, 10, 12, 12);
    context.fill(rule);
  }

  assertColor({
    actual: colorAt({
      canvas: nonzero.canvas,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas: evenodd.canvas,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: CLEAR
  });
  assertColor({
    actual: colorAt({
      canvas: evenodd.canvas,
      x: 5,
      y: 5
    }),
    expected: RED
  });
});

test("arc and ellipse draw round shapes, and isPointInPath hit-tests the path", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.beginPath();
  context.arc(MIDDLE, MIDDLE, 10, 0, Math.PI * 2);
  context.fill();
  assert.equal(context.isPointInPath(MIDDLE, MIDDLE), true);
  assert.equal(context.isPointInPath(1, 1), false);
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE + 8,
      y: MIDDLE
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE + 9,
      y: MIDDLE + 9
    }),
    expected: CLEAR
  });
  context.beginPath();
  context.ellipse(MIDDLE, MIDDLE, 4, 14, 0, 0, Math.PI * 2);
  context.strokeStyle = "blue";
  context.lineWidth = 2;
  context.stroke();
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: MIDDLE - 14
    }),
    expected: BLUE
  });
});

test("arcTo and roundRect make rounded corners", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.beginPath();
  context.roundRect(2, 2, 28, 28, 10);
  context.fill();
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 3,
      y: 3
    }),
    expected: CLEAR
  });
  const arcs = canvasOf();
  arcs.context.fillStyle = "blue";
  arcs.context.beginPath();
  arcs.context.moveTo(4, 4);
  arcs.context.arcTo(28, 4, 28, 28, 8);
  arcs.context.lineTo(28, 28);
  arcs.context.lineTo(4, 28);
  arcs.context.closePath();
  arcs.context.fill();
  assertColor({
    actual: colorAt({
      canvas: arcs.canvas,
      x: MIDDLE,
      y: MIDDLE
    }),
    expected: BLUE
  });
  assertColor({
    actual: colorAt({
      canvas: arcs.canvas,
      x: 27,
      y: 5
    }),
    expected: CLEAR
  });
});

test("linear and radial gradients blend their stops", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  const linear = context.createLinearGradient(0, 0, SIZE, 0);
  linear.addColorStop(0, "red");
  linear.addColorStop(1, "blue");
  context.fillStyle = linear;
  context.fillRect(0, 0, SIZE, MIDDLE);
  const near = colorAt({
    canvas,
    x: 1,
    y: 4
  });
  const far = colorAt({
    canvas,
    x: SIZE - 2,
    y: 4
  });
  assert.ok(near.r > 200 && near.b < 60, JSON.stringify(near));
  assert.ok(far.b > 200 && far.r < 60, JSON.stringify(far));
  const radial = context.createRadialGradient(MIDDLE, 24, 0, MIDDLE, 24, 8);
  radial.addColorStop(0, "green");
  radial.addColorStop(1, "green");
  context.fillStyle = radial;
  context.fillRect(0, MIDDLE, SIZE, MIDDLE);
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: 24
    }),
    expected: GREEN
  });
  assert.throws(() => linear.addColorStop(2, "red"), RangeError);
  assert.throws(() => linear.addColorStop(0.5, "nope"), SyntaxError);
});

test("save and restore bring back styles, transform and clip", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.save();
  context.fillStyle = "blue";
  context.translate(16, 16);
  context.rect(0, 0, 4, 4);
  context.clip();
  assert.equal(context.fillStyle, "#0000ff");
  context.restore();
  assert.equal(context.fillStyle, "#ff0000");
  assert.equal(context.getTransform().isIdentity, true);
  context.fillRect(0, 0, SIZE, SIZE);
  assertColor({
    actual: colorAt({
      canvas,
      x: 1,
      y: 1
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: SIZE - 1,
      y: SIZE - 1
    }),
    expected: RED
  });
  context.restore();
  assert.equal(context.fillStyle, "#ff0000");
});

test("translate, scale, rotate and setTransform move what is drawn", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.translate(8, 8);
  context.scale(2, 2);
  context.fillRect(0, 0, 4, 4);
  assert.deepEqual(
    [context.getTransform().a, context.getTransform().d, context.getTransform().e, context.getTransform().f],
    [2, 2, 8, 8]
  );
  assertColor({
    actual: colorAt({
      canvas,
      x: 12,
      y: 12
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 4,
      y: 4
    }),
    expected: CLEAR
  });
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "blue";
  context.fillRect(0, 0, 2, 2);
  assertColor({
    actual: colorAt({
      canvas,
      x: 1,
      y: 1
    }),
    expected: BLUE
  });
  context.resetTransform();
  context.translate(MIDDLE, MIDDLE);
  context.rotate(Math.PI / 2);
  context.fillStyle = "green";
  context.fillRect(0, 0, 8, 2);
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE - 1,
      y: MIDDLE + 6
    }),
    expected: GREEN
  });
});

test("clip limits drawing to the path, until restore", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.save();
  context.beginPath();
  context.rect(0, 0, MIDDLE, SIZE);
  context.clip();
  context.fillStyle = "red";
  context.fillRect(0, 0, SIZE, SIZE);
  context.restore();
  assertColor({
    actual: colorAt({
      canvas,
      x: 4,
      y: 4
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: SIZE - 4,
      y: 4
    }),
    expected: CLEAR
  });
  context.fillStyle = "blue";
  context.fillRect(SIZE - 8, 0, 8, 8);
  assertColor({
    actual: colorAt({
      canvas,
      x: SIZE - 4,
      y: 4
    }),
    expected: BLUE
  });
});

test("globalAlpha makes drawing translucent", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "white";
  context.fillRect(0, 0, SIZE, SIZE);
  context.globalAlpha = 0.5;
  context.fillStyle = "black";
  context.fillRect(0, 0, MIDDLE, SIZE);
  const half = colorAt({
    canvas,
    x: 4,
    y: 4
  });
  assert.ok(Math.abs(half.r - 128) < 8 && half.a === 255, JSON.stringify(half));
  context.globalAlpha = 2;
  assert.equal(context.globalAlpha, 0.5);
});

test("globalCompositeOperation and clearRect combine with what is drawn", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.fillRect(0, 0, SIZE, SIZE);
  context.clearRect(0, 0, MIDDLE, SIZE);
  assertColor({
    actual: colorAt({
      canvas,
      x: 4,
      y: 4
    }),
    expected: CLEAR
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: SIZE - 4,
      y: 4
    }),
    expected: RED
  });
  context.globalCompositeOperation = "destination-over";
  context.fillStyle = "blue";
  context.fillRect(0, 0, SIZE, SIZE);
  assertColor({
    actual: colorAt({
      canvas,
      x: 4,
      y: 4
    }),
    expected: BLUE
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: SIZE - 4,
      y: 4
    }),
    expected: RED
  });
  context.globalCompositeOperation = "multiply";
  assert.equal(context.globalCompositeOperation, "destination-over");
});

test("a shadow is drawn behind a shape", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.shadowColor = "blue";
  context.shadowOffsetX = 10;
  context.fillStyle = "red";
  context.fillRect(2, 8, 8, 8);
  assertColor({
    actual: colorAt({
      canvas,
      x: 5,
      y: 12
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 16,
      y: 12
    }),
    expected: BLUE
  });
});

test("drawImage takes three, five or nine arguments, from a bitmap or a canvas", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  const colors = Array.from({ length: 4 * 4 }, (_color, i) => i % 4 < 2 ? RED : BLUE);
  const bitmap = bitmapFromColors({
    creator: canvas.device,
    colors,
    width: 4,
    height: 4
  });
  context.imageSmoothingEnabled = false;
  context.drawImage(bitmap, 0, 0);
  assertColor({
    actual: colorAt({
      canvas,
      x: 1,
      y: 1
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 3,
      y: 1
    }),
    expected: BLUE
  });
  context.drawImage(bitmap, 8, 8, 16, 16);
  assertColor({
    actual: colorAt({
      canvas,
      x: 10,
      y: 10
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 22,
      y: 10
    }),
    expected: BLUE
  });
  context.drawImage(bitmap, 2, 0, 2, 4, 24, 24, 8, 8);
  assertColor({
    actual: colorAt({
      canvas,
      x: 26,
      y: 26
    }),
    expected: BLUE
  });
  const other = canvasOf();
  other.context.drawImage(canvas, 0, 0);
  assertColor({
    actual: colorAt({
      canvas: other.canvas,
      x: 1,
      y: 1
    }),
    expected: RED
  });
  assert.throws(() => context.drawImage(bitmap, 0, 0, 1, 1, 1), RangeError);
});

test("a canvas can be drawn onto itself", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.fillRect(0, 0, 8, 8);
  context.drawImage(canvas, 0, 0, 8, 8, 16, 16, 8, 8);
  assertColor({
    actual: colorAt({
      canvas,
      x: 20,
      y: 20
    }),
    expected: RED
  });
});

test("getImageData and putImageData round trip, and createImageData is blank", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "rgba(255, 0, 0, 0.5)";
  context.fillRect(0, 0, 4, 4);
  const image = context.getImageData(0, 0, 4, 4);
  assert.equal(image.width, 4);
  assert.equal(image.data.length, 4 * 4 * 4);
  assert.ok(Math.abs((image.data[0] ?? 0) - 255) <= 2, `red ${String(image.data[0])}`);
  assert.ok(Math.abs((image.data[3] ?? 0) - 128) <= 2, `alpha ${String(image.data[3])}`);
  const blank = context.createImageData(2, 3);
  assert.equal(blank.data.length, 2 * 3 * 4);
  assert.ok(blank.data.every(value => value === 0));
  const painted = new ImageData(new Uint8ClampedArray([0, 0, 255, 255, 0, 255, 0, 255]), 2);
  context.putImageData(painted, 10, 10);
  assertColor({
    actual: colorAt({
      canvas,
      x: 10,
      y: 10
    }),
    expected: BLUE
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 11,
      y: 10
    }),
    expected: {
      a: 255,
      r: 0,
      g: 255,
      b: 0
    }
  });
  const outside = context.getImageData(SIZE - 2, 0, 4, 1);
  assert.equal(outside.data[(2 * 4) + 3], 0);
});

test("patterns repeat an image", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  const tile = bitmapFromColors({
    creator: canvas.device,
    colors: [RED, BLUE, BLUE, RED],
    width: 2,
    height: 2
  });
  context.fillStyle = context.createPattern(tile, "repeat") ?? "black";
  context.fillRect(0, 0, SIZE, SIZE);
  assertColor({
    actual: colorAt({
      canvas,
      x: 0,
      y: 0
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 1,
      y: 0
    }),
    expected: BLUE
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 20,
      y: 20
    }),
    expected: RED
  });
  const once = canvasOf();
  once.context.fillStyle = once.context.createPattern(tile, "no-repeat") ?? "black";
  once.context.fillRect(0, 0, SIZE, SIZE);
  assertColor({
    actual: colorAt({
      canvas: once.canvas,
      x: 20,
      y: 20
    }),
    expected: CLEAR
  });
});

test("fillText puts ink where the baseline and alignment say, and measureText measures it", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf(64);
  context.font = "bold 24px sans-serif";
  const metrics = context.measureText("WW");
  const single = context.measureText("W");
  assert.ok(metrics.width > single.width * 1.5, `${metrics.width} vs ${single.width}`);
  assert.ok(metrics.actualBoundingBoxAscent > 0 && metrics.fontBoundingBoxAscent >= metrics.actualBoundingBoxAscent);
  context.fillStyle = "red";
  context.textBaseline = "top";
  context.fillText("W", 4, 4);
  const pixels = readPixels(canvas.target);
  function hasInk({ from, to }: {
    from: number;
    to: number;
  }) {
    for (let y = from; y < to; y++) {
      for (let x = 0; x < 64; x++) {
        const isLit = pixelAt({
          pixels,
          x,
          y
        }).r > 0;
        if (isLit) {
          return true;
        }
      }
    }

    return false;
  }
  assert.ok(
    hasInk({
      from: 4,
      to: 30
    })
  );
  assert.ok(
    !hasInk({
      from: 40,
      to: 64
    })
  );
  context.font = "nonsense";
  assert.equal(context.font, "bold 24px sans-serif");
  context.textAlign = "right";
  assert.equal(context.textAlign, "right");
});

test("a library-shaped caller draws on the canvas it is handed", { skip: !IS_AVAILABLE }, () => {
  const canvas = createCanvas2D({
    width: 48,
    height: 32
  });
  // What a charting library does: read the size, draw bars with save/restore
  // and a clip, label them, listen for the pointer.
  function drawBars(target: typeof canvas) {
    const drawing = target.getContext("2d");
    if (!drawing) {
      return;
    }

    const { width, height } = target.getBoundingClientRect();
    drawing.clearRect(0, 0, width, height);
    drawing.save();
    drawing.beginPath();
    drawing.rect(0, 0, width, height);
    drawing.clip();
    for (const [i, value] of [0.5, 1, 0.25].entries()) {
      drawing.fillStyle = i === 1 ? "rgb(0, 128, 0)" : "blue";
      drawing.fillRect(4 + i * 14, height - value * height, 10, value * height);
    }

    drawing.restore();
  }

  drawBars(canvas);
  assertColor({
    actual: colorAt({
      canvas,
      x: 4 + 14 + 5,
      y: 1
    }),
    expected: GREEN
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 4 + 5,
      y: 1
    }),
    expected: CLEAR
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 4 + 5,
      y: 30
    }),
    expected: BLUE
  });
  canvas.width = 48;
  assertColor({
    actual: colorAt({
      canvas,
      x: 4 + 14 + 5,
      y: 1
    }),
    expected: CLEAR
  });
});

test("a dashed line leaves gaps, and Path2D fills and strokes with the transform in force", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.strokeStyle = "blue";
  context.lineWidth = 2;
  context.setLineDash([4, 4]);
  assert.deepEqual(context.getLineDash(), [4, 4]);
  context.beginPath();
  context.moveTo(0, 4);
  context.lineTo(SIZE, 4);
  context.stroke();
  assertColor({
    actual: colorAt({
      canvas,
      x: 2,
      y: 4
    }),
    expected: BLUE
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 6,
      y: 4
    }),
    expected: CLEAR
  });
  context.setLineDash([]);
  context.translate(0, 8);
  context.fillStyle = "red";
  context.fill(new Path2D("M 4 4 h 24 v 16 h -24 z"));
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: 8 + 10
    }),
    expected: RED
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: MIDDLE,
      y: 8 + 24
    }),
    expected: CLEAR
  });
});

test("isPointInStroke follows the line width, and strokeText draws an outline", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf(64);
  context.lineWidth = 6;
  context.beginPath();
  context.moveTo(4, 20);
  context.lineTo(60, 20);
  assert.equal(context.isPointInStroke(30, 22), true);
  assert.equal(context.isPointInStroke(30, 30), false);
  context.font = "bold 40px sans-serif";
  context.strokeStyle = "blue";
  context.lineWidth = 2;
  context.strokeText("O", 8, 60);
  const pixels = readPixels(canvas.target);
  const lit = pixels.bytes.filter((_byte, i) => i % pixels.bytesPerPixel === 0 && _byte > 100);
  assert.ok(lit.length > 20, "the outline of the text left no blue");
});

test("the xor operation clears where shapes overlap, and a clip limits a composited shape", { skip: !IS_AVAILABLE }, () => {
  const { canvas, context } = canvasOf();
  context.fillStyle = "red";
  context.fillRect(0, 0, 20, 20);
  context.globalCompositeOperation = "xor";
  context.fillStyle = "blue";
  context.fillRect(10, 10, 20, 20);
  assertColor({
    actual: colorAt({
      canvas,
      x: 15,
      y: 15
    }),
    expected: CLEAR
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 25,
      y: 25
    }),
    expected: BLUE
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 5,
      y: 5
    }),
    expected: RED
  });
  const clipped = canvasOf();
  clipped.context.fillStyle = "red";
  clipped.context.fillRect(0, 0, SIZE, SIZE);
  clipped.context.beginPath();
  clipped.context.rect(0, 0, MIDDLE, SIZE);
  clipped.context.clip();
  clipped.context.globalCompositeOperation = "destination-over";
  clipped.context.fillStyle = "blue";
  clipped.context.fillRect(0, 0, SIZE, SIZE);
  assertColor({
    actual: colorAt({
      canvas: clipped.canvas,
      x: 4,
      y: 4
    }),
    expected: RED
  });
});

test("the bar chart of the example draws through the 2D API alone", { skip: !IS_AVAILABLE }, async () => {
  const { drawBarChart } = await import("#examples/win2d/bar-chart.ts");
  const canvas = createCanvas2D({
    width: 120,
    height: 100
  });
  drawBarChart({
    canvas,
    labels: ["a", "b", "c", "d"],
    values: [3, 7, 4, 9]
  });
  const tall = colorAt({
    canvas,
    x: 24 + 18 * 3 + 9,
    y: 60
  });
  assert.ok(tall.a === 255 && tall.b > tall.r, `the tallest bar is ${JSON.stringify(tall)}`);
  assertColor({
    actual: colorAt({
      canvas,
      x: 24 + 9,
      y: 30
    }),
    expected: CLEAR
  });
  const pixels = readPixels(canvas.target);
  let lit = 0;
  for (let y = 82; y < 98; y++) {
    for (let x = 24; x < 96; x++) {
      lit += pixelAt({
        pixels,
        x,
        y
      }).a > 0 ? 1 : 0;
    }
  }

  assert.ok(lit > 0, "no label under the axis");
  drawBarChart({
    canvas,
    labels: ["a"],
    values: [1]
  });
  assertColor({
    actual: colorAt({
      canvas,
      x: 24 + 18 * 3 + 9,
      y: 60
    }),
    expected: CLEAR
  });
});
