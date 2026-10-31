import assert from "node:assert/strict";
import { test } from "node:test";

// The web clipboard over a stand-in for the Windows clipboard: text, items,
// permissions, the change event, errors and the WinUI extras.

const { ClipboardItem, installClipboard } = await import("./clipboard.ts");
const { installPermissions } = await import("./permissions.ts");
const { DataTransfer, FormatType } = await import("#src/data-transfer/data-transfer.js");
const { nativeFileOfBytes } = await import("#src/data-transfer/native-file.js");

type Backend = NonNullable<Parameters<typeof installClipboard>[0]>["backend"];
type Content = Parameters<NonNullable<Backend>["write"]>[0];

function fakeBackend() {
  let content: Content = {};
  const written: Content[] = [];
  let changed: (() => void) | undefined;
  const history = [new DataTransfer()];
  history[0]?.setData(FormatType.text, "older");
  const backend = {
    read() {
      const transfer = new DataTransfer();
      for (const [type, value] of [
        [FormatType.text, content.text],
        [FormatType.html, content.html],
        [FormatType.uri, content.uri]
      ] as const) {
        const hasValue = value !== undefined;
        if (hasValue) {
          transfer.setData(type, value);
        }
      }

      for (const [format, value] of Object.entries(content.custom ?? {})) {
        transfer.setData(format, value);
      }

      if (content.bitmap) {
        transfer.addFile(content.bitmap);
      }

      return Promise.resolve(transfer);
    },
    write(next) {
      content = next;
      written.push(next);
      changed?.();
      return Promise.resolve();
    },
    onChange(callback) {
      changed = callback;
      return () => {
        changed = undefined;
      };
    },
    history: () => Promise.resolve(history)
  } satisfies NonNullable<Backend>;
  return {
    backend,
    written
  };
}

async function withClipboard(run: (fake: ReturnType<typeof fakeBackend>) => Promise<void>) {
  const fake = fakeBackend();
  const uninstallPermissions = installPermissions();
  const uninstall = installClipboard({ backend: fake.backend });
  try {
    await run(fake);
  } finally {
    uninstall();
    uninstallPermissions();
  }
}

test("writeText then readText round-trips", () => withClipboard(async () => {
  await navigator.clipboard.writeText("hello");
  assert.equal(await navigator.clipboard.readText(), "hello");
}));

test("readText is empty when the clipboard holds no text", () => withClipboard(async () => {
  assert.equal(await navigator.clipboard.readText(), "");
}));

test("write takes a ClipboardItem of text and html, read gives it back", () => withClipboard(async fake => {
  await navigator.clipboard.write([
    new ClipboardItem({
      "text/plain": new Blob(["plain"], { type: "text/plain" }),
      "text/html": Promise.resolve("<b>bold</b>")
    })
  ]);
  assert.deepEqual(fake.written[0], {
    text: "plain",
    html: "<b>bold</b>"
  });
  const [item] = await navigator.clipboard.read();
  assert.deepEqual(item?.types, ["text/plain", "text/html"]);
  assert.equal(await (await item?.getType("text/plain"))?.text(), "plain");
}));

test("an image item becomes a bitmap and reads back as a blob", () => withClipboard(async fake => {
  const bytes = new Uint8Array([1, 2, 3]);
  await navigator.clipboard.write([new ClipboardItem({ "image/png": new Blob([bytes], { type: "image/png" }) })]);
  assert.deepEqual(await fake.written[0]?.bitmap?.bytes(), bytes);
  const [item] = await navigator.clipboard.read();
  const blob = await item?.getType("image/png");
  assert.equal(blob?.type, "image/png");
  assert.equal(blob?.size, 3);
}));

test("web custom types are written as custom formats", () => withClipboard(async fake => {
  await navigator.clipboard.write([new ClipboardItem({ "web text/x-note": "n" })]);
  assert.deepEqual(fake.written[0]?.custom, { "text/x-note": "n" });
}));

test("an unsupported type and several items reject with NotAllowedError", () => withClipboard(async () => {
  await assert.rejects(navigator.clipboard.write([new ClipboardItem({ "application/pdf": "x" })]), { name: "NotAllowedError" });
  const item = new ClipboardItem({ "text/plain": "a" });
  await assert.rejects(navigator.clipboard.write([item, item]), { name: "NotAllowedError" });
}));

test("getType of a missing type rejects with NotFoundError", async () => {
  await assert.rejects(new ClipboardItem({ "text/plain": "a" }).getType("text/html"), { name: "NotFoundError" });
});

test("ClipboardItem needs an entry and says what it supports", () => {
  assert.throws(() => new ClipboardItem({}), TypeError);
  assert.equal(ClipboardItem.supports("text/plain"), true);
  assert.equal(ClipboardItem.supports("image/png"), true);
  assert.equal(ClipboardItem.supports("application/pdf"), false);
  assert.equal(new ClipboardItem({ "text/plain": "a" }).presentationStyle, "unspecified");
});

test("clipboardchange fires for listeners and the handler property", () => withClipboard(async () => {
  const seen: string[] = [];
  navigator.clipboard.addEventListener("clipboardchange", () => seen.push("listener"));
  navigator.clipboard.onclipboardchange = () => seen.push("handler");
  await navigator.clipboard.writeText("a");
  assert.deepEqual(seen, ["listener", "handler"]);
}));

test("the clipboard permissions are granted", () => withClipboard(async () => {
  for (const name of ["clipboard-read", "clipboard-write"]) {
    // @ts-expect-error -- the DOM typings list neither name as a PermissionName this runtime accepts
    const status = await navigator.permissions.query({ name });
    assert.equal(status.state, "granted");
  }
}));

test("the extras write and read files, formats and history", () => withClipboard(async fake => {
  const file = nativeFileOfBytes({
    name: "a.txt",
    type: "text/plain",
    content: new Uint8Array([97])
  });
  await navigator.clipboard.writeContent({
    custom: {
      "my-format": "v"
    },
    bitmap: file
  });
  assert.equal(fake.written.length, 1);
  const data = await navigator.clipboard.readContent();
  assert.equal(data.getData("my-format"), "v");
  assert.deepEqual(await navigator.clipboard.formats(), ["my-format", "Files"]);
  const [older] = await navigator.clipboard.history();
  assert.equal(older?.getData("text/plain"), "older");
}));

test("uninstall removes the globals and the permissions", async () => {
  const uninstallPermissions = installPermissions();
  const uninstall = installClipboard({ backend: fakeBackend().backend });
  uninstall();
  assert.equal("clipboard" in navigator, false);
  assert.equal("ClipboardItem" in globalThis, false);
  // @ts-expect-error -- the name is unregistered again
  await assert.rejects(navigator.permissions.query({ name: "clipboard-read" }), TypeError);
  uninstallPermissions();
});
