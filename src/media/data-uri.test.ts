import { decodeDataUri, isDataUri } from "./data-uri.ts";
import assert from "node:assert/strict";
import { test } from "node:test";

test("a base64 data URI decodes to its bytes and media type", () => {
  const { mimeType, bytes } = decodeDataUri("data:image/png;base64,iVBORw0=");
  assert.equal(mimeType, "image/png");
  assert.deepEqual([...bytes], [0x89, 0x50, 0x4e, 0x47, 0x0d]);
});

test("a percent-encoded SVG data URI decodes to its markup", () => {
  const { mimeType, bytes } = decodeDataUri("data:image/svg+xml;utf8,%3Csvg%20width%3D%221%22%2F%3E");
  assert.equal(mimeType, "image/svg+xml");
  assert.equal(new TextDecoder().decode(bytes), "<svg width=\"1\"/>");
});

test("a data URI without a media type is plain text", () => {
  assert.equal(decodeDataUri("data:,hi").mimeType, "text/plain");
});

test("a data URI without a comma is refused", () => {
  assert.throws(() => decodeDataUri("data:image/png"), /comma/u);
});

test("only a data: scheme is a data URI", () => {
  assert.equal(isDataUri(" DATA:image/png;base64,AA=="), true);
  assert.equal(isDataUri("https://example.com/a.png"), false);
  assert.equal(isDataUri("C:\\images\\a.png"), false);
});
