import { roInitialize } from "@microsoft/dynwinrt";
import { windowsImageCodec } from "#src/web-apis/image-codec-windows.js";
import { createCanvas2D } from "#src/win2d/context-2d/canvas-element.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// Real detection: sentences drawn with Win2D (headless, no window), read back
// with the OCR that ships with Windows through the TextDetector. Skipped where
// the Win2D library was not restored (pnpm restore), the bindings were not
// built (pnpm build) or no recognizer language is installed (Settings, Time
// and language).

const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
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

const { ImageBitmap, installImageCodecs } = await import("#src/web-apis/images.js");
const { TextDetector, installTextDetector } = await import("./index.ts");
const { ImageData } = await import("#src/win2d/context-2d/image-data.js");
const languages = IS_AVAILABLE ? TextDetector.availableOcrLanguages() : [];
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
    canvas,
    image: context.getImageData(0, 0, WIDTH, HEIGHT)
  };
}

function normalized(text: string) {
  return text.replace(/\s+/g, "").toLowerCase();
}

function textOf(texts: ReadonlyArray<{ readonly rawValue: string }>) {
  return normalized(texts.map(text => text.rawValue).join(""));
}

function overlaps({ first, second }: {
  first: Box;
  second: Box;
}) {
  return first.x < second.x + second.width && second.x < first.x + first.width
    && first.y < second.y + second.height && second.y < first.y + first.height;
}

test("an ImageData of a drawn sentence is one DetectedText whose words sit where they were drawn", { skip: SKIP }, async () => {
  const { image, boxes } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const texts = await new TextDetector().detect(image);
  assert.equal(texts.length, 1);
  const [line] = texts;
  assert.ok(line);
  assert.equal(normalized(line.rawValue), normalized(TOP_SENTENCE));
  assert.equal(line.words.length, TOP_SENTENCE.split(" ").length);
  assert.equal(line.cornerPoints.length, 4);
  const [drawn] = boxes;
  assert.ok(drawn);
  assert.ok(
    overlaps({
      first: line.boundingBox,
      second: drawn
    }), `${JSON.stringify(line.boundingBox)} misses ${JSON.stringify(drawn)}`
  );
  for (const word of line.words) {
    assert.ok(
      overlaps({
        first: word.boundingBox,
        second: drawn
      }), `${word.rawValue} lies outside the drawn text`
    );
    const isWithinDrawnWidth = word.boundingBox.left >= drawn.x - TEXT_HEIGHT
      && word.boundingBox.right <= drawn.x + drawn.width + TEXT_HEIGHT;
    assert.ok(isWithinDrawnWidth);
  }
});

test("an ImageBitmap, a canvas and a Blob of the same picture read the same text", { skip: SKIP }, async () => {
  const { image, canvas } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const uninstall = installImageCodecs();
  try {
    const detector = new TextDetector();
    const png = await windowsImageCodec().encode({
      image,
      type: "image/png",
      quality: undefined
    });
    const sources = [new ImageBitmap(image), canvas, new Blob([png], { type: "image/png" })];
    for (const source of sources) {
      assert.equal(textOf(await detector.detect(source)), normalized(TOP_SENTENCE), String(source));
    }
  } finally {
    uninstall();
  }
});

test("a region reads only its own sentence, with boxes in the source image's pixels", { skip: SKIP }, async () => {
  const { image, boxes } = render([
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
  assert.equal(textOf(await new TextDetector().detect(image)), normalized(TOP_SENTENCE + BOTTOM_SENTENCE));
  for (const [sentence, box] of [[TOP_SENTENCE, top], [BOTTOM_SENTENCE, bottom]] as const) {
    const detector = new TextDetector({
      region: {
        x: box.x - 20,
        y: box.y - 20,
        width: box.width + 40,
        height: box.height + 40
      }
    });
    const texts = await detector.detect(image);
    assert.equal(textOf(texts), normalized(sentence));
    for (const text of texts) {
      assert.ok(
        overlaps({
          first: text.boundingBox,
          second: box
        }), `${JSON.stringify(text.boundingBox)} misses ${JSON.stringify(box)}`
      );
    }
  }
});

test("a blank image and a region outside the image give no text", { skip: SKIP }, async () => {
  const { image } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  assert.deepEqual(await new TextDetector().detect(render([]).image), []);
  const outside = new TextDetector({
    region: {
      x: WIDTH,
      y: 0,
      width: 10,
      height: 10
    }
  });
  assert.deepEqual(await outside.detect(image), []);
});

test("the constructor and detect refuse what the web refuses", { skip: SKIP }, async () => {
  // @ts-expect-error a string where the options take an array: the web's TypeError
  assert.throws(() => new TextDetector({ languages: "en" }), TypeError);
  // @ts-expect-error an option the detector does not have: the web's TypeError
  assert.throws(() => new TextDetector({ unknown: 1 }), TypeError);
  assert.throws(() => new TextDetector({ languages: [MISSING_LANGUAGE] }), { name: "NotSupportedError" });
  const detector = new TextDetector();
  // @ts-expect-error a string is not an image source
  await assert.rejects(detector.detect("not an image"), TypeError);
  // @ts-expect-error no image at all
  await assert.rejects(detector.detect(), TypeError);
  const closed = new ImageBitmap(new ImageData(2, 2));
  closed.close();
  await assert.rejects(detector.detect(closed), { name: "InvalidStateError" });
});

test("a named installed language is the one that reads, an unsupported name is skipped", { skip: SKIP }, async () => {
  const [installed] = languages;
  assert.ok(installed);
  const { image } = render([{
    text: TOP_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const texts = await new TextDetector({ languages: [MISSING_LANGUAGE, installed] }).detect(image);
  assert.equal(textOf(texts), normalized(TOP_SENTENCE));
});

test("installTextDetector defines the globals and puts them away again", () => {
  const uninstall = installTextDetector();
  // @ts-expect-error the global is defined at run time, by the installer under test
  assert.equal(globalThis.TextDetector, TextDetector);
  assert.equal(typeof globalThis.DOMRectReadOnly, "function");
  uninstall();
  assert.equal("TextDetector" in globalThis, false);
});

test("a Hebrew line comes back with its words right to left, each with its own box", { skip: HEBREW_SKIP }, async () => {
  const { image } = render([{
    text: HEBREW_SENTENCE,
    x: LEFT,
    y: TOP_Y
  }]);
  const [line] = await new TextDetector({ languages: ["he"] }).detect(image);
  assert.equal(line?.words.length, 2);
  const [first, second] = line?.words ?? [];
  assert.ok(first && second);
  assert.ok(first.boundingBox.x > second.boundingBox.x, "the first word of a right-to-left line is the rightmost");
});
