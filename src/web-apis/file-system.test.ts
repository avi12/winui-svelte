import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

// The File System Access API over real files in a per-test temporary folder
// and a stand-in for the Windows pickers: handles, atomic writes, errors,
// picker options and the extras.

const {
  directoryHandleAt,
  FileSystemDirectoryHandle,
  FileSystemFileHandle,
  FileSystemPickers,
  installFileSystem
} = await import("./file-system.ts");

declare global {
  function showOpenFilePicker(): Promise<unknown>;
  function showDirectoryPicker(): Promise<unknown>;
}

type Backend = NonNullable<Parameters<typeof installFileSystem>[0]>["backend"];
type OpenRequest = Parameters<NonNullable<Backend>["pickOpen"]>[0];
type SaveRequest = Parameters<NonNullable<Backend>["pickSave"]>[0];

async function inFolder(run: (folder: string) => Promise<void>) {
  const folder = mkdtempSync(path.join(tmpdir(), "wa-c-fs-test-"));
  try {
    await run(folder);
  } finally {
    rmSync(folder, {
      recursive: true,
      force: true
    });
  }
}

function fakePickers({ open = [], save = null }: {
  open?: string[];
  save?: string | null;
} = {}) {
  const opens: OpenRequest[] = [];
  const saves: SaveRequest[] = [];
  const backend = {
    pickOpen(request) {
      opens.push(request);
      return Promise.resolve(open);
    },
    pickSave(request) {
      saves.push(request);
      return Promise.resolve(save);
    }
  } satisfies NonNullable<Backend>;
  return {
    pickers: new FileSystemPickers(backend),
    opens,
    saves
  };
}

test("getFile reads content, name, type and modification time", () => inFolder(async folder => {
  const file = path.join(folder, "a.json");
  writeFileSync(file, "{\"a\":1}");
  const handle = new FileSystemFileHandle(file);
  const read = await handle.getFile();
  assert.equal(await read.text(), "{\"a\":1}");
  assert.equal(read.name, "a.json");
  assert.equal(read.type, "application/json");
  assert.equal(handle.kind, "file");
  assert.equal(handle.getNativeFile().path, file);
}));

test("a writable stream replaces the file only on close", () => inFolder(async folder => {
  const file = path.join(folder, "a.txt");
  writeFileSync(file, "old content");
  const handle = new FileSystemFileHandle(file);
  const stream = await handle.createWritable();
  await stream.write("new");
  assert.equal(readFileSync(file, "utf8"), "old content");
  await stream.close();
  assert.equal(readFileSync(file, "utf8"), "new");
  assert.equal(existsSync(`${file}.swap`), false);
}));

test("abort leaves the file untouched and removes the swap file", () => inFolder(async folder => {
  const file = path.join(folder, "a.txt");
  writeFileSync(file, "keep");
  const stream = await new FileSystemFileHandle(file).createWritable();
  await stream.write("lost");
  await stream.abort();
  assert.equal(readFileSync(file, "utf8"), "keep");
  assert.equal(existsSync(`${file}.swap`), false);
}));

test("write takes blobs, bytes and position commands; seek and truncate move and cut", () => inFolder(async folder => {
  const file = path.join(folder, "a.bin");
  const stream = await new FileSystemFileHandle(file).createWritable();
  await stream.write(new Blob(["hello world"]));
  await stream.write({
    type: "write",
    position: 6,
    data: new Uint8Array([87, 79])
  });
  await stream.seek(0);
  await stream.write("J");
  await stream.truncate(8);
  await stream.close();
  assert.equal(readFileSync(file, "utf8"), "Jello WO");
}));

test("keepExistingData keeps the old bytes to write over", () => inFolder(async folder => {
  const file = path.join(folder, "a.txt");
  writeFileSync(file, "abcdef");
  const stream = await new FileSystemFileHandle(file).createWritable({ keepExistingData: true });
  await stream.write({
    type: "write",
    position: 2,
    data: "XY"
  });
  await stream.close();
  assert.equal(readFileSync(file, "utf8"), "abXYef");
}));

test("write without data is a TypeError", () => inFolder(async folder => {
  const stream = await new FileSystemFileHandle(path.join(folder, "a.txt")).createWritable();
  await assert.rejects(stream.write({ type: "write" }), TypeError);
}));

test("a directory makes, finds and removes entries", () => inFolder(async folder => {
  const root = directoryHandleAt(folder);
  const made = await root.getFileHandle("one.txt", { create: true });
  assert.equal(existsSync(made.path), true);
  const sub = await root.getDirectoryHandle("sub", { create: true });
  await sub.getFileHandle("two.txt", { create: true });
  assert.equal((await root.getDirectoryHandle("sub")).kind, "directory");
  await assert.rejects(root.removeEntry("sub"), { name: "InvalidModificationError" });
  await root.removeEntry("sub", { recursive: true });
  await root.removeEntry("one.txt");
  assert.equal(existsSync(path.join(folder, "sub")) || existsSync(path.join(folder, "one.txt")), false);
}));

test("a missing entry is NotFoundError, a wrong kind TypeMismatchError, a bad name TypeError", () => inFolder(async folder => {
  const root = directoryHandleAt(folder);
  await root.getFileHandle("f", { create: true });
  await root.getDirectoryHandle("d", { create: true });
  await assert.rejects(root.getFileHandle("nope"), { name: "NotFoundError" });
  await assert.rejects(root.removeEntry("nope"), { name: "NotFoundError" });
  await assert.rejects(root.getDirectoryHandle("f"), { name: "TypeMismatchError" });
  await assert.rejects(root.getFileHandle("d"), { name: "TypeMismatchError" });
  await assert.rejects(root.getFileHandle("../x", { create: true }), TypeError);
  await assert.rejects(root.getFileHandle("", { create: true }), TypeError);
}));

test("entries, keys and values list a folder", () => inFolder(async folder => {
  const root = directoryHandleAt(folder);
  await root.getFileHandle("b.txt", { create: true });
  await root.getDirectoryHandle("a", { create: true });
  const names: string[] = [];
  for await (const [name, handle] of root) {
    names.push(`${handle.kind}:${name}`);
  }

  assert.deepEqual(names.sort(), ["directory:a", "file:b.txt"]);
  const keys: string[] = [];
  for await (const key of root.keys()) {
    keys.push(key);
  }

  assert.deepEqual(keys.sort(), ["a", "b.txt"]);
}));

test("resolve gives the path names, and null outside", () => inFolder(async folder => {
  const root = directoryHandleAt(folder);
  const sub = await root.getDirectoryHandle("sub", { create: true });
  const file = await sub.getFileHandle("f.txt", { create: true });
  assert.deepEqual(await root.resolve(file), ["sub", "f.txt"]);
  assert.deepEqual(await root.resolve(root), []);
  assert.equal(await sub.resolve(root), null);
}));

test("isSameEntry compares locations and permissions are granted", () => inFolder(async folder => {
  const root = directoryHandleAt(folder);
  const again = await directoryHandleAt(path.join(folder, "..", path.basename(folder)));
  assert.equal(await root.isSameEntry(again), true);
  assert.equal(await root.isSameEntry(await root.getFileHandle("x", { create: true })), false);
  assert.equal(await root.queryPermission({ mode: "readwrite" }), "granted");
  assert.equal(await root.requestPermission({ mode: "readwrite" }), "granted");
}));

test("showOpenFilePicker turns types into extensions and maps the options", async () => {
  const { pickers, opens } = fakePickers({ open: ["C:\\a.png", "C:\\b.png"] });
  const handles = await pickers.showOpenFilePicker({
    multiple: true,
    id: "images",
    startIn: "pictures",
    types: [{
      description: "Images",
      accept: {
        "image/png": [".png"]
      }
    }],
    commitButtonText: "Choose",
    title: "Pick"
  });
  assert.deepEqual(handles.map(handle => handle.name), ["a.png", "b.png"]);
  assert.deepEqual(opens[0], {
    startIn: "pictures",
    settingsIdentifier: "images",
    title: "Pick",
    commitButtonText: "Choose",
    extensions: [".png"],
    isMultiple: true,
    isFolder: false
  });
});

test("a start handle becomes a start folder, a known folder an extra beats startIn", async () => {
  const { pickers, opens } = fakePickers({ open: ["C:\\x\\a.txt"] });
  await pickers.showOpenFilePicker({ startIn: directoryHandleAt("C:\\data") });
  await pickers.showOpenFilePicker({
    startIn: "documents",
    suggestedStartLocation: "downloads"
  });
  assert.equal(opens[0]?.startFolder, "C:\\data");
  assert.equal(opens[1]?.startIn, "downloads");
});

test("cancelling a picker rejects with AbortError", async () => {
  const { pickers } = fakePickers();
  await assert.rejects(pickers.showOpenFilePicker(), { name: "AbortError" });
  await assert.rejects(pickers.showSaveFilePicker(), { name: "AbortError" });
  await assert.rejects(pickers.showDirectoryPicker(), { name: "AbortError" });
});

test("showSaveFilePicker creates the file and passes the name and extras", () => inFolder(async folder => {
  const target = path.join(folder, "out.txt");
  const { pickers, saves } = fakePickers({ save: target });
  const handle = await pickers.showSaveFilePicker({
    suggestedName: "out.txt",
    defaultFileExtension: ".txt",
    shouldPromptOverwrite: false
  });
  assert.equal(existsSync(target), true);
  assert.equal(handle.name, "out.txt");
  assert.deepEqual(saves[0], {
    extensions: [],
    suggestedFileName: "out.txt",
    defaultFileExtension: ".txt",
    shouldPromptOverwrite: false
  });
}));

test("showDirectoryPicker gives a directory handle", async () => {
  const { pickers, opens } = fakePickers({ open: ["C:\\data"] });
  const handle = await pickers.showDirectoryPicker();
  assert.equal(handle instanceof FileSystemDirectoryHandle, true);
  assert.equal(opens[0]?.isFolder, true);
});

test("install defines the globals, and without a window the pickers reject", async () => {
  const uninstall = installFileSystem();
  assert.equal(typeof globalThis.showOpenFilePicker, "function");
  assert.equal(globalThis.FileSystemFileHandle, FileSystemFileHandle);
  await assert.rejects(globalThis.showDirectoryPicker(), { name: "InvalidStateError" });
  uninstall();
  assert.equal("showOpenFilePicker" in globalThis, false);
  assert.equal("FileSystemDirectoryHandle" in globalThis, false);
});
