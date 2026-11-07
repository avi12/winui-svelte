import { roInitialize } from "@microsoft/dynwinrt";
import { createCanvas2D } from "#src/win2d/context-2d/canvas-element.js";
import { ImageData } from "#src/win2d/context-2d/image-data.js";
import { pixelAt, readPixels } from "#src/win2d/resources.js";
import { initWindowsAppSdk } from "#src/window/bootstrap.js";
import { BitmapEncoder } from "#winui/windows/graphics/imaging/BitmapEncoder";
import { DataReader } from "#winui/windows/storage/streams/DataReader";
import { InMemoryRandomAccessStream } from "#winui/windows/storage/streams/InMemoryRandomAccessStream";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

// createImageBitmap, ImageDecoder and the canvas encoders. The logic runs over
// a stand-in codec; the encoded bytes and the round trips run over Windows'
// own codecs, headless. Skipped where the Win2D library was not restored
// (pnpm restore) or the bindings were not built (pnpm build).

const NATIVE_LIBRARY = path.join(import.meta.dirname, "..", "..", ".winapp", "bin", process.arch, "Microsoft.Graphics.Canvas.dll");
const BINDINGS = path.join(import.meta.dirname, "..", "..", "dist", "bindings", "microsoft", "graphics", "canvas", "CanvasDevice.js");
const IS_AVAILABLE = existsSync(NATIVE_LIBRARY) && existsSync(BINDINGS);
const SIZE = 8;
const CHANNELS = 4;
const GIF_FRAMES = 2;
const SMALL_QUALITY = 0.05;
const BIG_QUALITY = 0.95;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const GIF_SIGNATURE = "GIF8";
const BASE64_PNG_PREFIX = "data:image/png;base64,";
if (IS_AVAILABLE) {
  roInitialize();
  initWindowsAppSdk();
}

const { ImageBitmap, ImageDecoder, createImageBitmap, installImageCodecs } = await import("./images.ts");
const { windowsImageCodec } = await import("./image-codec-windows.ts");
const { pngBytesOf } = await import("./png-writer.ts");
const { flattenedOverBlack, premultipliedBgra } = await import("./image-pixels.ts");

// A picture whose pixels differ, so a flip, a crop and a resize are all visible.
function gradient({ width = SIZE, height = SIZE, alpha = 255 } = {}) {
  const image = new ImageData(width, height);
  for (let row = 0; row < height; row++) {
    for (let column = 0; column < width; column++) {
      const index = (row * width + column) * CHANNELS;
      image.data[index] = column * 30;
      image.data[index + 1] = row * 30;
      image.data[index + 2] = 100;
      image.data[index + 3] = alpha;
    }
  }

  return image;
}

function fakeCodec() {
  const encoded: Array<{
    type: string;
    quality: number | undefined;
  }> = [];
  return {
    encoded,
    codec: {
      canDecode: (type: string) => type === "image/png" || type === "image/gif",
      canEncode: (type: string) => type === "image/png" || type === "image/jpeg",
      async open(bytes: Uint8Array) {
        const frames = bytes[0] ?? 1;
        return {
          type: "image/gif",
          frameCount: frames,
          async decodeFrame({ frameIndex, isOrientationApplied }: {
            frameIndex: number;
            isOrientationApplied: boolean;
          }) {
            const image = new ImageData(2, 1);
            image.data[0] = frameIndex;
            image.data[3] = isOrientationApplied ? 255 : 1;
            return image;
          }
        };
      },
      async encode(request: {
        type: string;
        quality: number | undefined;
      }) {
        encoded.push({
          type: request.type,
          quality: request.quality
        });
        return new Uint8Array([request.type === "image/png" ? 1 : 2]);
      }
    }
  };
}

function blobOf({ bytes, type = "" }: {
  bytes: number[];
  type?: string;
}) {
  return new Blob([new Uint8Array(bytes)], { type });
}

function pixelsEqual({ actual, expected }: {
  actual: ImageData;
  expected: ImageData;
}) {
  assert.equal(actual.width, expected.width);
  assert.equal(actual.height, expected.height);
  assert.deepEqual([...actual.data], [...expected.data]);
}

test("pixel helpers premultiply, flatten and swap channels", () => {
  const half = new ImageData(new Uint8ClampedArray([200, 100, 50, 128]), 1, 1);
  assert.deepEqual([...premultipliedBgra(half)], [25, 50, 100, 128]);
  assert.deepEqual([...flattenedOverBlack(half).data], [100, 50, 25, 255]);
});

test("createImageBitmap copies pixels, crops, resizes and flips", async () => {
  const fake = fakeCodec();
  const uninstall = installImageCodecs({ codec: fake.codec });
  try {
    const source = gradient();
    const copy = await createImageBitmap(source);
    pixelsEqual({
      actual: copy.toImageData(),
      expected: source
    });
    assert.equal(copy.width, SIZE);

    const cropped = await createImageBitmap(source, 2, 3, 4, 2);
    assert.equal(cropped.width, 4);
    assert.equal(cropped.height, 2);
    assert.equal(cropped.toImageData().data[0], 2 * 30);
    assert.equal(cropped.toImageData().data[1], 3 * 30);

    const reaching = await createImageBitmap(source, 1, 1, -2, -2);
    assert.equal(reaching.width, 2);
    assert.equal(reaching.toImageData().data[0], 0);

    const outside = await createImageBitmap(source, SIZE - 1, 0, 2, 1);
    assert.equal(outside.toImageData().data[CHANNELS + 3], 0);

    const flipped = await createImageBitmap(source, { imageOrientation: "flipY" });
    assert.equal(flipped.toImageData().data[1], (SIZE - 1) * 30);

    const resized = await createImageBitmap(source, {
      resizeWidth: 4,
      resizeQuality: "pixelated"
    });
    assert.equal(resized.width, 4);
    assert.equal(resized.height, 4);

    await assert.rejects(createImageBitmap(source, 0, 0, 0, 1), RangeError);
    await assert.rejects(createImageBitmap(source, { resizeWidth: 0 }), { name: "InvalidStateError" });
    // @ts-expect-error -- a value that is none of the sources is a TypeError at run time
    await assert.rejects(createImageBitmap({}), TypeError);
  } finally {
    uninstall();
  }
});

test("createImageBitmap decodes a Blob, refusing a type no codec reads", async () => {
  const fake = fakeCodec();
  const uninstall = installImageCodecs({ codec: fake.codec });
  try {
    const bitmap = await createImageBitmap(
      blobOf({
        bytes: [1],
        type: "image/png"
      })
    );
    assert.equal(bitmap.width, 2);
    await assert.rejects(
      createImageBitmap(
        blobOf({
          bytes: [1],
          type: "image/x-nothing"
        })
      ), { name: "InvalidStateError" }
    );
    const unrotated = await createImageBitmap(blobOf({ bytes: [1] }), { imageOrientation: "none" });
    assert.equal(unrotated.toImageData().data[3], 1);
  } finally {
    uninstall();
  }
});

test("a closed ImageBitmap is empty and cannot be read", async () => {
  const uninstall = installImageCodecs({ codec: fakeCodec().codec });
  try {
    const bitmap = await createImageBitmap(gradient());
    bitmap.close();
    assert.equal(bitmap.width, 0);
    assert.throws(() => bitmap.toImageData(), { name: "InvalidStateError" });
  } finally {
    uninstall();
  }
});

test("ImageDecoder reads the tracks and each frame, and tells what it can decode", async () => {
  const uninstall = installImageCodecs({ codec: fakeCodec().codec });
  try {
    assert.equal(await ImageDecoder.isTypeSupported("image/gif"), true);
    assert.equal(await ImageDecoder.isTypeSupported("image/webp"), false);
    assert.throws(() => new ImageDecoder({
      data: new Uint8Array([1]),
      type: "image/webp"
    }), { name: "NotSupportedError" });

    const decoder = new ImageDecoder({
      data: new Uint8Array([3]),
      type: "image/gif"
    });
    assert.equal(decoder.tracks.length, 0);
    await decoder.tracks.ready;
    assert.equal(decoder.tracks.length, 1);
    assert.equal(decoder.tracks.selectedTrack?.frameCount, 3);
    assert.equal(decoder.tracks.selectedTrack?.animated, true);
    const second = await decoder.decode({ frameIndex: 2 });
    assert.ok(second.image instanceof ImageBitmap);
    assert.equal(second.image.toImageData().data[0], 2);
    assert.equal(second.complete, true);
    await decoder.completed;
    assert.equal(decoder.complete, true);
    await assert.rejects(decoder.decode({ frameIndex: 3 }), RangeError);
    decoder.close();
    await assert.rejects(decoder.decode(), { name: "InvalidStateError" });

    const stream = new ImageDecoder({
      data: new Blob([new Uint8Array([2])]).stream(),
      type: "image/gif"
    });
    await stream.tracks.ready;
    assert.equal(stream.tracks.selectedTrack?.frameCount, 2);
  } finally {
    uninstall();
  }
});

test("canvas encoders ask for the type and quality, falling back to PNG", async () => {
  const fake = fakeCodec();
  const uninstall = installImageCodecs({ codec: fake.codec });
  try {
    const canvas = createCanvas2D({
      width: 4,
      height: 4
    });
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 0.5
    });
    assert.equal(blob.type, "image/jpeg");
    await canvas.convertToBlob({ type: "image/webp" });
    await canvas.convertToBlob({
      type: "image/jpeg",
      quality: 7
    });
    const called = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve);
    });
    assert.equal(called?.type, "image/png");
    assert.deepEqual(fake.encoded, [
      {
        type: "image/jpeg",
        quality: 0.5
      },
      {
        type: "image/png",
        quality: undefined
      },
      {
        type: "image/jpeg",
        quality: 7
      },
      {
        type: "image/png",
        quality: undefined
      }
    ]);

    const empty = createCanvas2D({
      width: 0,
      height: 4
    });
    assert.equal(empty.toDataURL(), "data:,");
    assert.equal(
      await new Promise<Blob | null>(resolve => {
        empty.toBlob(resolve);
      }), null
    );
    await assert.rejects(empty.convertToBlob(), { name: "InvalidStateError" });
  } finally {
    uninstall();
  }
});

test("uninstalling removes the globals and the canvas methods", () => {
  const uninstall = installImageCodecs({ codec: fakeCodec().codec });
  assert.equal(typeof globalThis.createImageBitmap, "function");
  assert.equal(typeof createCanvas2D({}).toBlob, "function");
  uninstall();
  assert.equal("ImageDecoder" in globalThis, false);
  assert.equal("toBlob" in createCanvas2D({}), false);
});

test("the PNG writer makes a file Windows reads back", { skip: !IS_AVAILABLE }, async () => {
  const source = gradient({ alpha: 200 });
  const bytes = pngBytesOf(source);
  assert.deepEqual([...bytes.subarray(0, PNG_SIGNATURE.length)], PNG_SIGNATURE);
  const session = await windowsImageCodec().open(new Uint8Array(bytes));
  assert.equal(session.type, "image/png");
  pixelsEqual({
    actual: await session.decodeFrame({
      frameIndex: 0,
      isOrientationApplied: true
    }),
    expected: source
  });
});

test("Windows encodes PNG and JPEG, the JPEG smaller at a low quality", { skip: !IS_AVAILABLE }, async () => {
  const codec = windowsImageCodec();
  const image = gradient({
    width: 64,
    height: 64
  });
  const png = await codec.encode({
    image,
    type: "image/png",
    quality: undefined
  });
  assert.deepEqual([...png.subarray(0, PNG_SIGNATURE.length)], PNG_SIGNATURE);
  const low = await codec.encode({
    image,
    type: "image/jpeg",
    quality: SMALL_QUALITY
  });
  const high = await codec.encode({
    image,
    type: "image/jpeg",
    quality: BIG_QUALITY
  });
  assert.deepEqual([...low.subarray(0, JPEG_SIGNATURE.length)], JPEG_SIGNATURE);
  assert.ok(low.length < high.length);
  assert.equal(codec.canEncode("image/webp"), false);
  assert.equal(codec.canDecode("image/webp"), true);
  assert.equal(codec.canEncode("IMAGE/PNG"), true);
  await assert.rejects(
    codec.encode({
      image,
      type: "image/webp",
      quality: undefined
    })
  );
});

test("a canvas encodes to a Blob and a data URL that decode to what was drawn", { skip: !IS_AVAILABLE }, async () => {
  const uninstall = installImageCodecs();
  try {
    const canvas = createCanvas2D({
      width: SIZE,
      height: SIZE
    });
    const context = canvas.getContext("2d");
    assert.ok(context);
    context.fillStyle = "#ff0000";
    context.fillRect(0, 0, SIZE, SIZE);
    context.fillStyle = "#0000ff";
    context.fillRect(0, 0, SIZE / 2, SIZE);

    const blob = await canvas.convertToBlob();
    assert.equal(blob.type, "image/png");
    const decoded = await createImageBitmap(blob);
    assert.deepEqual([...decoded.toImageData().data.subarray(0, CHANNELS)], [0, 0, 255, 255]);
    const lastPixel = decoded.toImageData().data.subarray((SIZE - 1) * CHANNELS, SIZE * CHANNELS);
    assert.deepEqual([...lastPixel], [255, 0, 0, 255]);

    const url = canvas.toDataURL("image/jpeg");
    assert.ok(url.startsWith(BASE64_PNG_PREFIX));
    const fromUrl = await createImageBitmap(new Blob([Buffer.from(url.slice(BASE64_PNG_PREFIX.length), "base64")], { type: "image/png" }));
    pixelsEqual({
      actual: fromUrl.toImageData(),
      expected: decoded.toImageData()
    });

    const jpeg = await canvas.toDataURLAsync("image/jpeg", 0.8);
    assert.ok(jpeg.startsWith("data:image/jpeg;base64,/9j/"));
    const webp = await canvas.toDataURLAsync("image/webp");
    assert.ok(webp.startsWith(BASE64_PNG_PREFIX));
  } finally {
    uninstall();
  }
});

test("an ImageBitmap draws onto a canvas", { skip: !IS_AVAILABLE }, async () => {
  const uninstall = installImageCodecs();
  try {
    const image = new ImageData(SIZE, SIZE);
    for (let i = 0; i < image.data.length; i += CHANNELS) {
      image.data[i] = 0;
      image.data[i + 1] = 255;
      image.data[i + 3] = 255;
    }

    const bitmap = await createImageBitmap(image);
    const canvas = createCanvas2D({
      width: SIZE,
      height: SIZE
    });
    const context = canvas.getContext("2d");
    assert.ok(context);
    context.drawImage(bitmap, 0, 0);
    const pixel = pixelAt({
      pixels: readPixels(canvas.target),
      x: 1,
      y: 1
    });
    assert.deepEqual(pixel, {
      a: 255,
      r: 0,
      g: 255,
      b: 0
    });
    bitmap.close();
  } finally {
    uninstall();
  }
});

test("Windows decodes the frames of a GIF", { skip: !IS_AVAILABLE }, async () => {
  const stream = new InMemoryRandomAccessStream();
  const encoder = await BitmapEncoder.createAsync(BitmapEncoder.gifEncoderId, stream);
  const frame = new Uint8Array(SIZE * SIZE * CHANNELS).fill(255);
  encoder.setPixelData(87, 1, SIZE, SIZE, 96, 96, frame);
  await encoder.goToNextFrameAsync();
  encoder.setPixelData(87, 1, SIZE, SIZE, 96, 96, frame);
  await encoder.flushAsync();
  stream.seek(0n);
  const reader = new DataReader(stream);
  await reader.loadAsync(Number(stream.size));
  const bytes = new Uint8Array(reader.readBytes(new Uint8Array(Number(stream.size))));
  assert.equal(Buffer.from(bytes.subarray(0, GIF_SIGNATURE.length)).toString("latin1"), GIF_SIGNATURE);

  const uninstall = installImageCodecs();
  try {
    assert.equal(await ImageDecoder.isTypeSupported("image/gif"), true);
    const decoder = new ImageDecoder({
      data: bytes,
      type: "image/gif"
    });
    await decoder.tracks.ready;
    assert.equal(decoder.tracks.selectedTrack?.frameCount, GIF_FRAMES);
    assert.equal(decoder.tracks.selectedTrack?.animated, true);
    const { image } = await decoder.decode({ frameIndex: 1 });
    assert.equal(image.width, SIZE);
    assert.equal(image.toImageData().data[3], 255);
  } finally {
    uninstall();
  }
});
