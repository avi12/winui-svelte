import assert from "node:assert/strict";
import { test } from "node:test";

const { ImageSearchEngine } = await import("./engines.ts");
const { buildImageSearchRequest, ImageSearchUnsupportedError } = await import("./image-search-request.ts");
const { imageSearchUrl, ImageSearchError } = await import("./image-search.ts");

const BYTES = new Uint8Array([1, 2, 3, 250]);
const BYTES_BASE64 = "AQID+g==";
const HOSTED = "https://example.com/a b.png";

test("Lens uploads the file in encoded_image", async () => {
  const request = await buildImageSearchRequest({
    engine: ImageSearchEngine.GOOGLE_LENS,
    image: {
      blob: new Blob([BYTES])
    }
  });
  assert.equal(request.method, "POST");
  assert.equal(request.url, "https://lens.google.com/v3/upload");
  assert.equal(request.fields[0]?.name, "encoded_image");
  assert.ok(request.fields[0]?.value instanceof Blob);
});

test("Bing uploads base64 in imageBin", async () => {
  const request = await buildImageSearchRequest({
    engine: ImageSearchEngine.BING,
    image: {
      blob: new Blob([BYTES])
    }
  });
  assert.equal(request.fields[0]?.name, "imageBin");
  assert.equal(request.fields[0]?.value, BYTES_BASE64);
});

test("an address becomes a GET result page for every engine", async () => {
  for (const engine of Object.values(ImageSearchEngine)) {
    const request = await buildImageSearchRequest({
      engine,
      image: {
        url: HOSTED
      }
    });
    assert.equal(request.method, "GET");
    assert.ok(request.url.includes(encodeURIComponent(HOSTED)));
  }
});

test("Yandex and TinEye refuse an upload", async () => {
  for (const engine of [ImageSearchEngine.YANDEX, ImageSearchEngine.TINEYE]) {
    await assert.rejects(
      buildImageSearchRequest({
        engine,
        image: {
          blob: new Blob([BYTES])
        }
      }),
      ImageSearchUnsupportedError
    );
  }
});

test("bad input is rejected by the schema", async () => {
  await assert.rejects(
    buildImageSearchRequest({
      engine: ImageSearchEngine.BING,
      image: {
        url: "file:///a.png"
      }
    })
  );
  await assert.rejects(
    buildImageSearchRequest({
      engine: ImageSearchEngine.BING,
      image: {
        url: "nope"
      }
    })
  );
  await assert.rejects(
    buildImageSearchRequest({
      // @ts-expect-error an unknown engine must fail at run time as well
      engine: "altavista",
      image: {
        url: HOSTED
      }
    })
  );
});

test("an upload returns the redirect without following it", async () => {
  const seen: Array<{
    url: string;
    init: RequestInit;
  }> = [];
  const url = await imageSearchUrl({
    engine: ImageSearchEngine.GOOGLE_LENS,
    image: {
      blob: new Blob([BYTES])
    },
    fetch(input, init) {
      seen.push({
        url: input,
        init
      });
      return Promise.resolve(
        new Response(null, {
          status: 303,
          headers: {
            location: "/search?vsrid=1"
          }
        })
      );
    }
  });
  assert.equal(url, "https://lens.google.com/search?vsrid=1");
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.init.redirect, "manual");
  assert.ok(seen[0]?.init.body instanceof FormData);
});

test("an answer without a redirect is an error", async () => {
  await assert.rejects(
    imageSearchUrl({
      engine: ImageSearchEngine.BING,
      image: {
        blob: new Blob([BYTES])
      },
      fetch: () => Promise.resolve(new Response("blocked", { status: 429 }))
    }),
    ImageSearchError
  );
});

test("an address makes no network call", async () => {
  const url = await imageSearchUrl({
    engine: ImageSearchEngine.TINEYE,
    image: {
      url: HOSTED
    },
    fetch: () => Promise.reject(new Error("no call expected"))
  });
  assert.ok(url.startsWith("https://tineye.com/search?url="));
});
