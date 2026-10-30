import { clipboard } from "./clipboard.ts";
import { FormatType } from "./data-transfer.ts";
import { DataTransfer } from "./data-transfer.ts";
import { nativeFileAt } from "./native-file.ts";
import { fillPackage, snapshotOf } from "./package-io.ts";
import { sourceOf, targetOf } from "./winrt-package.ts";
import { roInitialize } from "@microsoft/dynwinrt";
import { DataPackage } from "#winui/windows/application-model/data-transfer/DataPackage";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The mapping on the real WinRT classes, with no window: a DataPackage a
// drag source fills is read back through its view, as a drop target reads it.
// The clipboard test swaps the clipboard's text for its own and puts the
// original back, and does nothing when the clipboard holds anything but text.

const SINGLE_THREADED_APARTMENT = 0;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SMALL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==",
  "base64"
);

roInitialize(SINGLE_THREADED_APARTMENT);

test("a package a source fills reads back through its view as a target reads it", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "winui-svelte-package-"));
  try {
    const filePath = path.join(folder, "note.txt");
    const picturePath = path.join(folder, "pixel.png");
    await writeFile(filePath, "file body");
    await writeFile(picturePath, SMALL_PNG);
    const transfer = new DataTransfer();
    transfer.setData(FormatType.text, "hello");
    transfer.setData(FormatType.html, "<b>hello</b>");
    transfer.setData(FormatType.uri, "https://example.com/page");
    transfer.setData("application/x-winui-svelte", "custom");
    transfer.addFile(nativeFileAt(filePath));
    transfer.addFile(nativeFileAt(folder));
    transfer.bitmap = nativeFileAt(picturePath);
    const data = new DataPackage();
    await fillPackage({
      transfer,
      target: targetOf(data)
    });

    const snapshot = await snapshotOf({
      source: sourceOf(data.getView()),
      customFormats: ["application/x-winui-svelte"]
    });
    assert.equal(snapshot.strings.get(FormatType.text), "hello");
    assert.equal(snapshot.strings.get(FormatType.html), "<b>hello</b>");
    assert.equal(snapshot.strings.get(FormatType.uri), "https://example.com/page");
    assert.equal(snapshot.strings.get("application/x-winui-svelte"), "custom");
    const names = snapshot.files.map(file => file.name);
    assert.ok(names.includes("note.txt"));
    assert.ok(names.includes(path.basename(folder)));
    const picture = snapshot.files.find(file => file.path === "");
    assert.equal(picture?.type, "image/png");
    assert.deepEqual([...(await picture?.bytes() ?? []).subarray(0, PNG_SIGNATURE.length)], PNG_SIGNATURE);
    assert.ok(snapshot.types.includes("Files"));
  } finally {
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
});

test("the clipboard round trip returns the text it was given, and the original is put back", async context => {
  const types = clipboard.types();
  const isTextOnly = types.every(type => type === FormatType.text);
  if (!isTextOnly) {
    context.skip("the clipboard holds something other than text; it is left alone");
    return;
  }

  const original = await clipboard.readText();
  const hasText = types.length > 0;
  try {
    await clipboard.writeText("winui-svelte clipboard test");
    assert.equal(await clipboard.readText(), "winui-svelte clipboard test");
    await clipboard.write({
      text: "plain",
      html: "<i>rich</i>"
    });
    assert.equal(await clipboard.readHtml(), "<i>rich</i>");
    const read = await clipboard.read();
    assert.equal(read.getData(FormatType.text), "plain");
  } finally {
    if (hasText) {
      await clipboard.writeText(original);
    } else {
      clipboard.clear();
    }
  }
});
