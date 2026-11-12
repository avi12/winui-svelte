import { BarcodeDetector, installBarcodeDetector } from "./barcode-detector.ts";
import { encodeEan } from "#src/barcode/test-support/linear-encoder.js";
import { encodeQr } from "#src/barcode/test-support/qr-encoder.js";
import { embed, gridFromBars, render } from "#src/barcode/test-support/render.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import assert from "node:assert/strict";
import { test } from "node:test";

const URL_TEXT = "https://github.com/avi12/winui-svelte";
const EAN_13 = "5901234123457";

function imageDataOf(image: {
  readonly pixels: Uint8ClampedArray;
  readonly width: number;
}) {
  return new ImageData(image.pixels, image.width);
}

test("getSupportedFormats lists the formats the engine reads, by their web names", async () => {
  assert.deepEqual(await BarcodeDetector.getSupportedFormats(), ["qr_code", "ean_13", "ean_8", "upc_a", "code_128"]);
});

test("detect finds a QR code and gives the web's shape", async () => {
  const image = render({
    grid: encodeQr({ text: URL_TEXT }).grid,
    scale: 4
  });
  const [code, ...rest] = await new BarcodeDetector().detect(imageDataOf(image));
  assert.equal(rest.length, 0);
  assert.equal(code?.format, "qr_code");
  assert.equal(code?.rawValue, URL_TEXT);
  assert.equal(code?.cornerPoints.length, 4);
  const box = code?.boundingBox;
  assert.ok(box && box.right === box.x + box.width && box.bottom === box.y + box.height);
});

test("detect reads a linear code, and the formats option limits the search", async () => {
  const image = imageDataOf(
    render({
      grid: gridFromBars({
        bars: encodeEan(EAN_13),
        height: 30
      }),
      scale: 3
    })
  );
  const [code] = await new BarcodeDetector({ formats: ["ean_13"] }).detect(image);
  assert.equal(code?.format, "ean_13");
  assert.equal(code?.rawValue, EAN_13);
  assert.deepEqual(await new BarcodeDetector({ formats: ["qr_code"] }).detect(image), []);
});

test("the region option searches a crop and reports whole-image pixels", async () => {
  const symbol = render({
    grid: encodeQr({ text: "crop" }).grid,
    scale: 4
  });
  const image = embed({
    image: symbol,
    width: 600,
    height: 500,
    offset: {
      x: 300,
      y: 200
    },
    fill: () => 255
  });
  const [code] = await new BarcodeDetector({
    region: {
      x: 250,
      y: 150,
      width: 350,
      height: 350
    }
  }).detect(imageDataOf(image));
  assert.equal(code?.rawValue, "crop");
  assert.ok((code?.boundingBox.x ?? 0) >= 300);
  assert.deepEqual(
    await new BarcodeDetector({
      region: {
        x: 0,
        y: 0,
        width: 100,
        height: 100
      }
    }).detect(imageDataOf(image)), []
  );
});

test("an unsupported or empty formats list throws a TypeError, as on the web", () => {
  assert.throws(() => new BarcodeDetector({ formats: ["pdf417"] }), TypeError);
  assert.throws(() => new BarcodeDetector({ formats: [] }), TypeError);
});

test("detect rejects a source that is not an image with a TypeError", async () => {
  await assert.rejects(new BarcodeDetector().detect({ nothing: true } as unknown as ImageData), TypeError);
});

test("installBarcodeDetector defines the global and removes it again", () => {
  const uninstall = installBarcodeDetector();
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, "BarcodeDetector")?.value, BarcodeDetector);
  uninstall();
  assert.equal(Object.getOwnPropertyDescriptor(globalThis, "BarcodeDetector")?.value, undefined);
});
