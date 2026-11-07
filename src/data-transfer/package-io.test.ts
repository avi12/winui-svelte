import { DataKind } from "./accept.ts";
import { DataTransfer, FormatType } from "./data-transfer.ts";
import { allowedOperationsOf, effectAllowedOf, effectOf, operationOf } from "./drag-effects.ts";
import { fragmentOfHtmlFormat, htmlFormatOf } from "./html-format.ts";
import { FileKind, nativeFileAt, nativeFileOfBytes } from "./native-file.ts";
import type { NativeFile } from "./native-file.ts";
import { fillPackage, previewOf, snapshotOf } from "./package-io.ts";
import type { PackageSource, PackageTarget } from "./package-io.ts";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The mapping between the web's DataTransfer and a WinUI data package, on
// stand-ins for the package view and the package.

function fakeSource({ kinds, files = [], formats = [] }: {
  kinds: DataKind[];
  files?: NativeFile[];
  formats?: string[];
}) {
  return {
    formats: () => formats,
    has: kind => kinds.includes(kind),
    readText: () => Promise.resolve("plain"),
    readHtml: () => Promise.resolve(htmlFormatOf("<b>bold</b>")),
    readUri: () => Promise.resolve("https://example.com/"),
    readFiles: () => Promise.resolve(files),
    readBitmap: () => Promise.resolve(
      nativeFileOfBytes({
        name: "image",
        type: "image/png",
        content: new Uint8Array([1, 2, 3])
      })
    ),
    readCustom: format => Promise.resolve(format === "application/x-note" ? "note" : undefined)
  } satisfies PackageSource;
}

test("the types of a package are the web's names", () => {
  const source = fakeSource({
    kinds: [DataKind.text, DataKind.uri, DataKind.file, DataKind.directory],
    formats: ["Text", "StorageItems", "application/x-note"]
  });
  assert.deepEqual(previewOf(source).types, ["text/plain", "text/uri-list", "Files", "application/x-note"]);
});

test("before the drop nothing but the types is readable", () => {
  const preview = previewOf(fakeSource({ kinds: [DataKind.text] }));
  assert.equal(preview.getData(FormatType.text), "");
  assert.deepEqual(preview.files, []);
});

test("a snapshot reads the text formats, the files and the custom formats asked for", async () => {
  const file = nativeFileOfBytes({
    name: "a.txt",
    type: "text/plain",
    content: new Uint8Array()
  });
  const snapshot = await snapshotOf({
    source: fakeSource({
      kinds: [DataKind.text, DataKind.html, DataKind.uri, DataKind.file],
      files: [file],
      formats: ["application/x-note"]
    }),
    customFormats: ["application/x-note", "application/x-other"]
  });
  const transfer = new DataTransfer(snapshot);
  assert.equal(transfer.getData("text/plain"), "plain");
  assert.equal(transfer.getData("text/html"), "<b>bold</b>");
  assert.equal(transfer.getData("text/uri-list"), "https://example.com/");
  assert.equal(transfer.getData("application/x-note"), "note");
  assert.equal(transfer.getData("application/x-other"), "");
  assert.deepEqual(transfer.files, [file]);
  assert.ok(transfer.types.includes("Files"));
  assert.equal(transfer.items.length, 5);
});

test("a format that fails to read is left out and the rest still come", async () => {
  const source = {
    ...fakeSource({ kinds: [DataKind.text, DataKind.html] }),
    readHtml: () => Promise.reject(new Error("gone"))
  };
  const snapshot = await snapshotOf({ source });
  assert.equal(snapshot.strings.get("text/plain"), "plain");
  assert.equal(snapshot.strings.has("text/html"), false);
});

test("the CF_HTML text carries the fragment and offsets that point at it", () => {
  const html = htmlFormatOf("<p>héllo</p>");
  assert.equal(fragmentOfHtmlFormat(html), "<p>héllo</p>");
  const bytes = Buffer.from(html);
  const start = Number(/StartFragment:(\d+)/u.exec(html)?.[1]);
  const end = Number(/EndFragment:(\d+)/u.exec(html)?.[1]);
  assert.equal(bytes.subarray(start, end).toString(), "<p>héllo</p>");
  assert.equal(fragmentOfHtmlFormat("no markers"), "no markers");
});

test("filling a package sends each format to its setter", async () => {
  const calls: string[] = [];
  const target: PackageTarget = {
    setText: text => calls.push(`text:${text}`),
    setHtml: fragment => calls.push(`html:${fragment}`),
    setUri: uri => calls.push(`uri:${uri}`),
    setCustom: ({ format, value }) => calls.push(`custom:${format}=${value}`),
    setFiles(files) {
      calls.push(`files:${files.map(file => file.name).join(",")}`);
      return Promise.resolve();
    },
    setBitmap(file) {
      calls.push(`bitmap:${file.name}`);
      return Promise.resolve();
    },
    setDeferred: ({ type }) => calls.push(`deferred:${type}`)
  };
  const transfer = new DataTransfer();
  transfer.setData("text/plain", "hi");
  transfer.setData("text/html", "<i>hi</i>");
  transfer.setData("text/uri-list", "# comment\r\nhttps://example.com/a\r\nhttps://example.com/b");
  transfer.setData("application/x-note", "n");
  transfer.items.add(
    nativeFileOfBytes({
      name: "f.bin",
      type: "",
      content: new Uint8Array()
    })
  );
  transfer.bitmap = nativeFileOfBytes({
    name: "pic",
    type: "image/png",
    content: new Uint8Array()
  });
  transfer.setDeferredData({
    type: "text/x-late",
    provider: () => Promise.resolve("late")
  });
  await fillPackage({
    transfer,
    target
  });
  assert.deepEqual(calls, [
    "text:hi",
    "html:<i>hi</i>",
    "uri:https://example.com/a",
    "custom:application/x-note=n",
    "deferred:text/x-late",
    "files:f.bin",
    "bitmap:pic"
  ]);
});

test("deferred data is offered as a type, never read, and replaced by setData", async () => {
  let runs = 0;
  const transfer = new DataTransfer();
  transfer.setDeferredData({
    type: "text/plain",
    provider() {
      runs += 1;
      return Promise.resolve("made");
    }
  });
  assert.deepEqual(transfer.types, ["text/plain"]);
  assert.equal(transfer.getData("text/plain"), "");
  assert.equal(runs, 0);
  assert.equal(await transfer.deferredEntries()[0]?.[1](), "made");
  transfer.setData("text/plain", "now");
  assert.deepEqual(transfer.deferredEntries(), []);
  transfer.setDeferredData({
    type: "a",
    provider: () => Promise.resolve("")
  });
  transfer.clearData("a");
  assert.deepEqual(transfer.deferredEntries(), []);
});

test("clearData removes one format or all of them", () => {
  const transfer = new DataTransfer();
  transfer.setData("a", "1");
  transfer.setData("b", "2");
  transfer.clearData("a");
  assert.deepEqual(transfer.types, ["b"]);
  transfer.clearData();
  assert.deepEqual(transfer.types, []);
});

test("effects map to WinUI operations and back", () => {
  assert.equal(effectOf(operationOf("move")), "move");
  assert.equal(effectOf(allowedOperationsOf("all")), "copy");
  assert.equal(effectOf(allowedOperationsOf("linkMove")), "move");
  assert.equal(effectOf(0), "none");
  assert.equal(effectAllowedOf(allowedOperationsOf("copyMove")), "copyMove");
  assert.equal(effectAllowedOf(0), "none");
  assert.equal(allowedOperationsOf("uninitialized"), allowedOperationsOf("all"));
});

test("a file read from disk has the web File's members", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "winui-svelte-file-"));
  try {
    const filePath = path.join(folder, "Note.md");
    await writeFile(filePath, "héllo");
    const file = nativeFileAt(filePath);
    assert.equal(file.name, "Note.md");
    assert.equal(file.kind, FileKind.file);
    assert.equal(file.type, "text/markdown");
    assert.equal(file.size, Buffer.byteLength("héllo"));
    assert.equal(await file.text(), "héllo");
    assert.equal((await file.bytes()).length, file.size);
    assert.equal((await file.arrayBuffer()).byteLength, file.size);
    const chunks: Uint8Array[] = [];
    for await (const chunk of file.stream()) {
      chunks.push(chunk);
    }

    assert.equal(Buffer.concat(chunks).toString(), "héllo");
    const directory = nativeFileAt(folder);
    assert.equal(directory.kind, FileKind.directory);
    assert.deepEqual(directory.entries().map(entry => entry.name), ["Note.md"]);
    await assert.rejects(directory.text(), /is a folder/u);
    assert.throws(() => file.entries(), /not a folder/u);
  } finally {
    await rm(folder, {
      recursive: true,
      force: true
    });
  }
});
