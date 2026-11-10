import { roInitialize } from "@microsoft/dynwinrt";
import { windowsImageCodec } from "#src/web-apis/image-codec-windows.js";
import { createCanvas2D } from "#src/win2d/context-2d/canvas-element.js";
import { readPixels } from "#src/win2d/resources.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Real recognition: sentences drawn with Win2D (headless, no window), read
// back with the OCR that ships with Windows. Skipped where the Win2D library
// was not restored (pnpm restore), the bindings were not built (pnpm build) or
// no recognizer language is installed (Settings, Time and language).

const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
const IS_AVAILABLE = existsSync(NATIVE_LIBRARY) && existsSync(BINDINGS);
const FONT = "56px 'Segoe UI'";
const WIDTH = 1000;
const HEIGHT = 500;
const TOP_SENTENCE = "The quick brown fox";
const BOTTOM_SENTENCE = "jumps over the lazy dog";
const LEFT = 40;
const TOP_Y = 60;
const BOTTOM_Y = 360;
const TEXT_HEIGHT = 80;
const HEBREW_SENTENCE = "שלום עולם";
const MISSING_LANGUAGE = "xx";
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
}

const { availableOcrLanguages, recognizeText } = await import("./index.ts");
const languages = IS_AVAILABLE ? availableOcrLanguages() : [];
const SKIP = IS_AVAILABLE
  ? languages.length === 0 && "no OCR recognizer language is installed on this machine"
  : "the Win2D library or the built bindings are missing (pnpm restore, pnpm build)";
const HEBREW_SKIP = SKIP || (!languages.some(tag => tag.toLowerCase().startsWith("he")) && "no Hebrew OCR recognizer is installed on this machine");

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface Drawn {
  readonly text: string;
  readonly x: number;
  readonly y: number;
}

function render(drawn: readonly Drawn[]) {
  const canvas = createCanvas2D({
    width: WIDTH,
    height: HEIGHT
  });
  const context = canvas.getContext("2d");
  assert.ok(context);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = "#000000";
  context.font = FONT;
  context.textBaseline = "top";
  const boxes = drawn.map(({ text, x, y }) => {
    context.fillText(text, x, y);
    return {
      x,
      y,
      width: context.measureText(text).width,
      height: TEXT_HEIGHT
    };
  });
  return {
    boxes,
    bgra: readPixels(canvas.target).bytes,
    image: context.getImageData(0, 0, WIDTH, HEIGHT)
  };
}

function normalized(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

function overlaps({ first, second }: {
  first: Box;
  second: Box;
}) {
  return first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.height && second.y < first.y + first.height;
}

test("pixels of a drawn sentence come back as a line whose words sit where they were drawn", { skip: SKIP }, async () => {
  const { bgra, boxes } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const result = await recognizeText({
    pixels: bgra,
    width: WIDTH,
    height: HEIGHT
  });
  assert.equal(result.lines.length, 1);
  const [line] = result.lines;
  assert.equal(normalized(line?.text ?? ""), normalized(TOP_SENTENCE));
  assert.ok(languages.includes(result.language));
  assert.equal(line?.words.length, TOP_SENTENCE.split(" ").length);
  const [drawn] = boxes;
  assert.ok(drawn);
  assert.ok(
    overlaps({
      first: line?.bounds ?? drawn,
      second: drawn
    }), `${JSON.stringify(line?.bounds)} misses ${JSON.stringify(drawn)}`
  );
  for (const word of line?.words ?? []) {
    assert.ok(
      overlaps({
        first: word.bounds,
        second: drawn
      }), `${word.text} lies outside the drawn text`
    );
    const isWithinDrawnWidth = word.bounds.x >= drawn.x - TEXT_HEIGHT
      && word.bounds.x + word.bounds.width <= drawn.x + drawn.width + TEXT_HEIGHT;
    assert.ok(isWithinDrawnWidth);
  }
});

test("the same image encoded as JPEG and as PNG reads the same text", { skip: SKIP }, async () => {
  const { image } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const codec = windowsImageCodec();
  for (const type of ["image/jpeg", "image/png"] as const) {
    const encoded = await codec.encode({
      image,
      type,
      quality: undefined
    });
    const result = await recognizeText({ jpeg: encoded });
    assert.equal(normalized(result.lines.map(line => line.text).join("")), normalized(TOP_SENTENCE), type);
  }
});

test("a region reads only its own sentence, with boxes in the source image's pixels", { skip: SKIP }, async () => {
  const { bgra, image, boxes } = render([
    {
      text: TOP_SENTENCE,
      x: LEFT,
      y: TOP_Y
    },
    {
      text: BOTTOM_SENTENCE,
      x: LEFT,
      y: BOTTOM_Y
    }
  ]);
  const [top, bottom] = boxes;
  assert.ok(top && bottom);
  const encoded = await windowsImageCodec().encode({
    image,
    type: "image/png",
    quality: undefined
  });
  for (const [sentence, box] of [[TOP_SENTENCE, top], [BOTTOM_SENTENCE, bottom]] as const) {
    const region = {
      x: box.x - 20,
      y: box.y - 20,
      width: box.width + 40,
      height: box.height + 40
    };
    const fromPixels = await recognizeText({
      pixels: bgra,
      width: WIDTH,
      height: HEIGHT,
      region
    });
    const fromEncoded = await recognizeText({
      jpeg: encoded,
      region
    });
    for (const result of [fromPixels, fromEncoded]) {
      assert.equal(normalized(result.lines.map(line => line.text).join("")), normalized(sentence));
      for (const line of result.lines) {
        assert.ok(
          overlaps({
            first: line.bounds,
            second: box
          }), `${JSON.stringify(line.bounds)} misses ${JSON.stringify(box)}`
        );
      }
    }
  }
});

test("a language that is not installed, a blank image and a region outside the image give no lines and never throw", { skip: SKIP }, async () => {
  const { bgra } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const empty = {
    lines: [],
    language: ""
  };
  assert.deepEqual(
    await recognizeText({
      pixels: bgra,
      width: WIDTH,
      height: HEIGHT,
      languages: [MISSING_LANGUAGE]
    }), empty
  );
  assert.deepEqual(
    await recognizeText({
      pixels: render([]).bgra,
      width: WIDTH,
      height: HEIGHT
    }), empty
  );
  assert.deepEqual(
    await recognizeText({
      pixels: bgra,
      width: WIDTH,
      height: HEIGHT,
      region: {
        x: WIDTH,
        y: 0,
        width: 10,
        height: 10
      }
    }), empty
  );
  assert.deepEqual(
    await recognizeText({
      pixels: new Uint8Array(4),
      width: WIDTH,
      height: HEIGHT
    }), empty
  );
  assert.deepEqual(await recognizeText({ jpeg: new Uint8Array([1, 2, 3]) }), empty);
});

test("a named installed language is the one that reads", { skip: SKIP }, async () => {
  const [installed] = languages;
  assert.ok(installed);
  const { bgra } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const result = await recognizeText({
    pixels: bgra,
    width: WIDTH,
    height: HEIGHT,
    languages: [MISSING_LANGUAGE, installed]
  });
  assert.equal(result.language, installed);
  assert.equal(normalized(result.lines.map(line => line.text).join("")), normalized(TOP_SENTENCE));
});

test("a Hebrew line comes back with its words right to left, each with its own box", { skip: HEBREW_SKIP }, async () => {
  const { bgra } = render([{
    text: HEBREW_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const result = await recognizeText({
    pixels: bgra,
    width: WIDTH,
    height: HEIGHT,
    languages: ["he"]
  });
  const [line] = result.lines;
  assert.equal(line?.words.length, 2);
  const [first, second] = line?.words ?? [];
  assert.ok(first && second);
  assert.ok(first.bounds.x > second.bounds.x, "the first word of a right-to-left line is the rightmost");
});
